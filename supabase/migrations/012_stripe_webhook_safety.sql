-- Make the billing webhook safe to deliver twice, and out of order.
--
-- Stripe retries on any non-2xx and explicitly does not guarantee ordering.
-- The webhook trusted both: it applied whatever arrived, whenever it arrived,
-- to whatever the profile currently said. So a `customer.subscription.updated`
-- carrying `incomplete` that overtook the `active` one behind it left a paying
-- customer locked out of their own account with nothing further coming to fix
-- it.

-- ── Idempotency ──────────────────────────────────────────────────────────────
-- Every event Stripe has already been told we handled. A redelivery of an
-- event we processed is a no-op instead of a replay.
create table if not exists public.stripe_events (
  id text primary key,               -- Stripe's evt_… id
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- No policies, deliberately. Only the service role touches this, and the
-- service role bypasses RLS — so `authenticated` gets nothing, which is right
-- for a table that is purely billing bookkeeping.

revoke all on public.stripe_events from anon, authenticated;

-- Retention: this grows one row per billing event forever otherwise. Stripe
-- retries for up to ~3 days, so anything older than a month cannot still be
-- in flight.
create index if not exists idx_stripe_events_received
  on public.stripe_events (received_at);

-- ── Ordering ─────────────────────────────────────────────────────────────────
-- When the subscription state on this profile was last written, measured by
-- the Stripe event's own creation time rather than ours. An event older than
-- this is stale by definition and is dropped rather than applied.
alter table public.profiles
  add column if not exists subscription_event_at timestamptz;

-- No grant needed: migration 004 revoked UPDATE on profiles wholesale and 006
-- re-granted display_name alone, so a column added here is unwritable from the
-- browser by default. Worth stating rather than assuming — a client able to set
-- this could pin its account on a future timestamp and make every real Stripe
-- event that followed look stale, freezing whatever status suited it.
