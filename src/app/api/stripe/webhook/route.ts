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

type Supabase = ReturnType<typeof adminSupabase>;

/**
 * Write the subscription state, unless something newer already has.
 *
 * Stripe explicitly does not guarantee delivery order. This route applied
 * whatever arrived whenever it arrived, so a `customer.subscription.updated`
 * carrying `incomplete` that overtook the `active` one behind it left a paying
 * customer locked out — with nothing further coming to correct it, because the
 * correction had already been delivered and discarded.
 *
 * The guard is the event's own creation time, not ours: it is assigned by
 * Stripe when the state actually changed, which is the only ordering that
 * means anything here.
 *
 * Returns false if the write failed, so the caller can answer non-2xx and let
 * Stripe retry. Previously every one of these returned 200 regardless, so a
 * single Supabase blip meant the status was never written and never would be.
 */
async function applySubscriptionState(
  supabase: Supabase,
  userId: string,
  eventCreated: number,
  fields: {
    /** Omitted when the event does not name one — writing a blank over a real
     *  subscription id would break the portal and the account screen. */
    subscription_id?: string | null;
    subscription_status: string;
    trial_end?: number | null;
  },
): Promise<boolean> {
  const eventAt = new Date(eventCreated * 1000).toISOString();

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("subscription_event_at")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    console.error("[stripe-webhook] profile read failed", readError);
    return false;
  }
  if (!profile) {
    // No such user. Retrying cannot conjure one, so this is handled, not failed.
    console.warn("[stripe-webhook] no profile for", userId);
    return true;
  }

  const seen = (profile as { subscription_event_at: string | null })
    .subscription_event_at;
  if (seen && new Date(seen).getTime() > eventCreated * 1000) {
    return true;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_status: fields.subscription_status,
      ...(fields.subscription_id ? { subscription_id: fields.subscription_id } : {}),
      subscription_event_at: eventAt,
      // Only ever EXTEND the trial window, never clear it. Checkout creates
      // no-trial subscriptions, so sub.trial_end is always null — previously
      // that nulled trial_ends_at on every event, so subscribing on day 2 of
      // the free week silently forfeited the remaining days (and, for a 3DS
      // card arriving as `incomplete`, locked the user out entirely).
      ...(fields.trial_end
        ? { trial_ends_at: new Date(fields.trial_end * 1000).toISOString() }
        : {}),
    })
    .eq("id", userId);

  if (error) {
    console.error("[stripe-webhook] profile update failed", error);
    return false;
  }
  return true;
}

/**
 * Which user this subscription belongs to.
 *
 * The metadata is set at checkout, and reading it was the only lookup here —
 * so a subscription created any other way (from the Stripe dashboard, or by a
 * plan change that did not carry metadata forward) silently did nothing at
 * all. The customer paid and got no access, and no error was raised anywhere,
 * because "no user id" and "nothing to do" were the same branch.
 */
async function resolveUserId(
  supabase: Supabase,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = sub.metadata?.supabase_user_id;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
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

  /**
   * Claim the event before doing anything with it.
   *
   * Stripe retries on every non-2xx, and this route now answers non-2xx on a
   * failed write — which is the point, but it also means redelivery is no
   * longer theoretical. The primary key does the work: a second delivery of an
   * event already recorded conflicts, and we acknowledge without replaying it.
   */
  const { error: claimError } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (claimError) {
    // 23505 is unique_violation: already handled, nothing to do.
    if ((claimError as { code?: string }).code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Anything else means we cannot tell whether this is a replay. Better to
    // be retried than to guess.
    console.error("[stripe-webhook] could not record event", claimError);
    return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  }

  const fail = async (reason: string) => {
    // Release the claim, or the retry Stripe is about to send would be treated
    // as a duplicate and dropped — leaving the account permanently wrong and
    // the delivery permanently marked as handled.
    await supabase.from("stripe_events").delete().eq("id", event.id);
    console.error("[stripe-webhook]", reason, event.type, event.id);
    return NextResponse.json({ error: reason }, { status: 500 });
  };

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId(supabase, sub);
      if (!userId) {
        // Nothing to apply it to, and a retry would resolve the same way.
        console.warn("[stripe-webhook] unattributable subscription", sub.id);
        break;
      }
      const ok = await applySubscriptionState(supabase, userId, event.created, {
        subscription_id: sub.id,
        // `deleted` carries the pre-cancellation status on the object itself,
        // so it has to be stated rather than read.
        subscription_status:
          event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
        trial_end: sub.trial_end ?? null,
      });
      if (!ok) return fail("Could not apply subscription state");
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, subscription_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (error) return fail("Could not read profile");
      if (!profile) break;

      const row = profile as { id: string; subscription_id: string | null };
      const ok = await applySubscriptionState(supabase, row.id, event.created, {
        subscription_id: row.subscription_id,
        subscription_status: "past_due",
      });
      if (!ok) return fail("Could not mark past_due");
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
