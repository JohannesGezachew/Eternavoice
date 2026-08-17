-- What the persona should call you.
--
-- Until now the app had no idea who it was speaking to. The persona learned
-- your name only by accident, from whatever the summariser happened to extract
-- out of a conversation — which is why it leaked into memories as a literal
-- third-person string ("Safa mentioned a topic called 'Beachtungsplan'") and
-- into conversation titles ("Hey, Safa."). A name the app is told is a name it
-- can use consistently, and one that never has to be written into a memory.
--
-- Migration 004 revoked UPDATE on profiles wholesale, because at the time every
-- column on the table was billing state and none of it belonged to the user. It
-- said to re-grant explicitly per column if a user-editable field was ever
-- added. This is that field, and this is that grant — display_name only, so
-- subscription_status and friends stay untouchable from the browser.

alter table profiles
  add column if not exists display_name text;

grant update (display_name) on public.profiles to authenticated;
