-- Stop users writing their own billing state.
--
-- 001 created:
--   create policy "Users can update their own profile"
--     on profiles for update using (auth.uid() = id);
--
-- That is row-scoped but not COLUMN-scoped, and Supabase's default grants give
-- `authenticated` UPDATE on every column. Since profiles holds
-- subscription_status / trial_ends_at / subscription_id / stripe_customer_id,
-- and middleware.ts reads exactly those to decide access, any signed-in user
-- could run
--     supabase.from('profiles').update({ subscription_status: 'active' })
-- from the browser console and hold paid access forever, with Stripe never
-- involved.
--
-- Billing columns must only ever be written by the service role (the Stripe
-- webhook). There is currently no user-writable column on this table, so the
-- UPDATE grant is revoked outright rather than narrowed; re-grant explicitly
-- per column if a user-editable profile field is added later.

revoke update on public.profiles from anon, authenticated;

-- Row scoping still applies to the remaining rights, and WITH CHECK stops a
-- row being moved to another owner should an UPDATE grant ever be restored.
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- data_key_enc is key material; nobody but the service role should read it.
revoke select (data_key_enc) on public.profiles from anon, authenticated;
