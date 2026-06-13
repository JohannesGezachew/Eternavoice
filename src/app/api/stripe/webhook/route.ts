import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function stripe() {
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-05-27.dahlia" });
}

// Service-role client — no cookie needed for webhooks
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function upsertSubscriptionStatus(
  supabaseUserId: string,
  subscriptionId: string,
  status: string,
  trialEnd?: number | null,
) {
  const supabase = adminSupabase();
  await supabase
    .from("profiles")
    .update({
      subscription_status: status,
      subscription_id: subscriptionId,
      // Keep the in-app trial window in sync with Stripe so a Stripe-managed
      // trial is never cut short by a stale signup-time trial_ends_at.
      ...(trialEnd !== undefined
        ? { trial_ends_at: trialEnd ? new Date(trialEnd * 1000).toISOString() : null }
        : {}),
    })
    .eq("id", supabaseUserId);
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Webhook signature invalid" }, { status: 400 });
  }

  const supabase = adminSupabase();

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        await upsertSubscriptionStatus(userId, sub.id, sub.status, sub.trial_end ?? null);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        await upsertSubscriptionStatus(userId, sub.id, "canceled");
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, subscription_id")
        .eq("stripe_customer_id", customerId)
        .single();
      if (profile) {
        await supabase
          .from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("id", profile.id);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
