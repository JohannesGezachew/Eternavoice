import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function stripe() {
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-05-27.dahlia" });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { origin } = new URL(request.url);
  const client = stripe();

  // Find or create Stripe customer
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await client.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const session = await client.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    // The free week happens in-app at signup (profiles.trial_ends_at), so
    // checkout charges from day one — no double trial.
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
    // Re-enable once Stripe Tax is configured (origin address + registrations).
    automatic_tax: { enabled: false },
    success_url: `${origin}/people?subscribed=1`,
    cancel_url: `${origin}/subscribe?cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
