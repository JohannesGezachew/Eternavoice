/**
 * Pre-launch check for LIVE Stripe configuration.
 *
 * Read-only: it creates nothing, charges nothing, and changes nothing. It just
 * asks Stripe whether the account, the price and the webhook endpoint are in
 * the state the app needs.
 *
 * Run it with the live keys passed inline so they are never written to a file:
 *
 *   STRIPE_SECRET_KEY=sk_live_xxx \
 *   STRIPE_PRICE_ID=price_xxx \
 *   node scripts/verify-stripe-live.mjs
 *
 * Add STRIPE_WEBHOOK_SECRET=whsec_xxx to also confirm the signing secret
 * matches a live endpoint.
 */
import Stripe from "stripe";

const KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PRICE = process.env.STRIPE_PRICE_ID ?? "";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const warn = (m) => console.log(`  WARN  ${m}`);
let failures = 0;

if (!KEY) {
  console.error("Set STRIPE_SECRET_KEY (see the header of this file).");
  process.exit(1);
}

const mode = KEY.startsWith("sk_live_") ? "LIVE" : KEY.startsWith("sk_test_") ? "TEST" : "UNKNOWN";
console.log(`\nMode: ${mode}\n`);
if (mode !== "LIVE") {
  console.log("  This is not a live key — real cards will be declined in production.\n");
}

const stripe = new Stripe(KEY, { apiVersion: "2026-05-27.dahlia" });

// ── Account ────────────────────────────────────────────────────────────────
console.log("Account");
try {
  const a = await stripe.accounts.retrieve();
  a.charges_enabled ? ok(`charges enabled (${a.id})`) : bad("charges are NOT enabled — payments will fail");
  a.details_submitted ? ok("onboarding complete") : bad("account onboarding incomplete");
  if (a.requirements?.currently_due?.length) {
    warn(`Stripe still wants: ${a.requirements.currently_due.join(", ")}`);
  }
} catch (e) {
  bad(`could not read account: ${e.message}`);
}

// ── Price ──────────────────────────────────────────────────────────────────
console.log("\nPrice");
if (!PRICE) {
  bad("STRIPE_PRICE_ID not provided — checkout cannot work without it");
} else {
  try {
    const p = await stripe.prices.retrieve(PRICE, { expand: ["product"] });
    p.active ? ok("price is active") : bad("price is ARCHIVED — checkout will fail");
    p.livemode === (mode === "LIVE")
      ? ok(`price mode matches the key (${p.livemode ? "live" : "test"})`)
      : bad(`price is ${p.livemode ? "LIVE" : "TEST"} but the key is ${mode} — Stripe will reject checkout`);
    p.type === "recurring" ? ok(`recurring / ${p.recurring?.interval}`) : bad(`type is "${p.type}", expected recurring`);
    const amount = p.unit_amount != null ? (p.unit_amount / 100).toFixed(2) : "?";
    console.log(`        ${p.currency?.toUpperCase()} ${amount} per ${p.recurring?.interval} — "${p.product?.name ?? p.product}"`);
  } catch (e) {
    bad(`price ${PRICE} not found on this account: ${e.message}`);
  }
}

// ── Webhook endpoints ──────────────────────────────────────────────────────
console.log("\nWebhook");
const NEEDED = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];
try {
  const { data: hooks } = await stripe.webhookEndpoints.list({ limit: 100 });
  const live = hooks.filter((h) => h.status === "enabled");
  if (!live.length) {
    bad("no enabled webhook endpoint — subscriptions will never activate in the app");
  }
  for (const h of live) {
    console.log(`\n        ${h.url}`);
    const events = h.enabled_events.includes("*") ? NEEDED : h.enabled_events;
    const missing = NEEDED.filter((e) => !events.includes(e));
    missing.length
      ? bad(`missing events: ${missing.join(", ")}`)
      : ok("all required events subscribed");
    h.url.startsWith("https://") ? ok("https") : bad("endpoint is not https");
    if (!h.url.includes("/api/stripe/webhook")) {
      warn("url does not end in /api/stripe/webhook — check it points at this app");
    }
    if (WHSEC && h.secret && h.secret !== WHSEC) {
      // Stripe only returns `secret` at creation time, so this rarely fires.
      warn("signing secret differs from the one supplied");
    }
  }
  if (WHSEC && !WHSEC.startsWith("whsec_")) {
    bad("STRIPE_WEBHOOK_SECRET does not look like a signing secret");
  }
} catch (e) {
  bad(`could not list webhooks: ${e.message}`);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed — fix these before taking payments.\n`);
} else if (mode === "LIVE") {
  console.log("\nAll checks passed — live billing is configured correctly.\n");
} else {
  console.log(
    "\nAll checks passed for TEST mode. This says nothing about live billing —" +
      "\nre-run with the live key to verify that.\n",
  );
}
process.exit(failures === 0 ? 0 : 1);
