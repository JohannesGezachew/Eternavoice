-- Durable usage accounting.
--
-- The previous limiter was an in-memory Map, which is per-instance on
-- serverless and wiped on every cold start — effectively no limit at all.
-- This table is the shared counter, so a limit means the same thing on every
-- lambda.
--
-- Two kinds of row live here, distinguished by period_start:
--   * burst   — a short rolling window (runaway loops, scripted abuse)
--   * monthly — the subscriber's generous allowance for the calendar month
--
-- Rows are cheap and self-expiring by period; a periodic delete of old
-- periods is optional housekeeping, not required for correctness.

create table if not exists usage_counters (
  user_id uuid not null references profiles(id) on delete cascade,
  scope text not null,               -- 'chat' | 'clone' | 'transcribe' | ...
  period_start timestamptz not null, -- bucket boundary
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope, period_start)
);

create index if not exists usage_counters_lookup
  on usage_counters (user_id, scope, period_start desc);

alter table usage_counters enable row level security;

-- Users may read their own usage (the account screen shows it). All writes go
-- through the service role in the increment function below, so there is no
-- insert/update policy — a client cannot forge or reset its own counter.
create policy "Users can read their own usage"
  on usage_counters for select
  using (auth.uid() = user_id);

-- Atomic check-and-increment. Returns the count AFTER incrementing, so the
-- caller can compare against its limit without a second round trip and
-- without a read-modify-write race between concurrent lambdas.
create or replace function increment_usage(
  p_user_id uuid,
  p_scope text,
  p_period_start timestamptz
)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  new_count int;
begin
  insert into public.usage_counters (user_id, scope, period_start, count, updated_at)
  values (p_user_id, p_scope, p_period_start, 1, now())
  on conflict (user_id, scope, period_start)
  do update set count = public.usage_counters.count + 1, updated_at = now()
  returning count into new_count;

  return new_count;
end;
$$;
