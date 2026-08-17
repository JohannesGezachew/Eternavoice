-- Indexes that match what the app actually asks for, and RLS policies that
-- stop re-deciding the same thing once per row.
--
-- Every index below was chosen by reading the queries, not by guessing: each
-- one names the call site it serves. Two existing indexes are dropped because
-- nothing queries the way they are shaped.

-- ── The hottest query in the app ─────────────────────────────────────────────
-- assertVoiceOwner runs on every chat turn, every replay, every reading and
-- every voice delete, and it is the control that keeps one person's cloned
-- voice away from everybody else. It filters (user_id, voice_id) and had only
-- idx_subjects_user_id to work with.
create index if not exists idx_subjects_user_voice
  on public.subjects (user_id, voice_id)
  where deleted_at is null;

-- ── The chat critical path ───────────────────────────────────────────────────
-- Both of these sit inside the Promise.all that gates time-to-first-token, and
-- both were sorting without an index to sort by.
create index if not exists idx_memories_user_subject_updated
  on public.memories (user_id, subject_id, updated_at desc)
  where deleted_at is null;

create index if not exists idx_session_summaries_recent
  on public.session_summaries (user_id, subject_id, created_at desc);

-- ── Every page load ──────────────────────────────────────────────────────────
-- getConversations orders by updated_at and idx_conversations_user_id covers
-- only user_id, so Postgres sorted the user's whole history before LIMIT.
create index if not exists idx_conversations_user_updated
  on public.conversations (user_id, updated_at desc)
  where deleted_at is null;

-- ── The Stripe webhook ───────────────────────────────────────────────────────
-- invoice.payment_failed looks a profile up by stripe_customer_id under the
-- service role, so RLS does not scope it: without an index that is a full scan
-- of every profile in the system. Unique because the checkout route already
-- relies on there being at most one, and .single() throws if there are two.
create unique index if not exists idx_profiles_stripe_customer
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- ── Account deletion ─────────────────────────────────────────────────────────
-- turns is the largest table in the schema and had no index on user_id at all,
-- so erasing an account sequentially scanned it. A GDPR path should not be the
-- slowest query in the product.
create index if not exists idx_turns_user
  on public.turns (user_id);

-- ── Remove what nothing uses ─────────────────────────────────────────────────
-- An exact prefix of usage_counters' primary key, so it can never be chosen
-- over it — while still costing a B-tree write on the hottest write path in
-- the app, which is every rate-limit check.
drop index if exists public.usage_counters_lookup;

-- No query filters or orders on archived_at; the archived/active split happens
-- in JavaScript in peopleView.ts.
drop index if exists public.idx_subjects_user_archived;

-- ── Stop re-evaluating auth.uid() per row ────────────────────────────────────
-- A bare auth.uid() in a policy is treated as volatile and re-run for every
-- candidate row — parsing the JWT again each time. Wrapped in a subselect it
-- becomes a one-time InitPlan. On the conversations-with-turns read, which
-- touches thousands of rows, this is the difference between one JWT parse and
-- thousands. Cheapest change in this file by a wide margin.
alter policy "Users can read their own profile" on public.profiles
  using ((select auth.uid()) = id);

alter policy "Users can update their own profile" on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "Users can manage their own subjects" on public.subjects
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can manage their own conversations" on public.conversations
  using ((select auth.uid()) = user_id);

alter policy "Users can manage their own turns" on public.turns
  using ((select auth.uid()) = user_id);

alter policy "Users can manage their own memories" on public.memories
  using ((select auth.uid()) = user_id);

alter policy "Users can manage their own session summaries" on public.session_summaries
  using ((select auth.uid()) = user_id);

alter policy "Users can read their own usage" on public.usage_counters
  using ((select auth.uid()) = user_id);

alter policy "Users can manage their own readings" on public.readings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
