-- New accounts begin with a real 7-day in-app trial — no card required.
-- This makes the landing-page promise ("free for seven days, no card to
-- begin") literally true: middleware admits 'trialing' profiles until
-- trial_ends_at passes, and Stripe checkout only appears after that.

alter table profiles
  add column if not exists trial_ends_at timestamptz;

alter table profiles
  alter column subscription_status set default 'trialing';

alter table profiles
  alter column trial_ends_at set default (now() + interval '7 days');

-- Accounts that signed up before this migration and never reached Stripe
-- were stuck on 'inactive' behind the paywall. Grant them the week they
-- were promised, starting now.
update profiles
  set subscription_status = 'trialing',
      trial_ends_at = now() + interval '7 days'
  where subscription_status = 'inactive'
    and stripe_customer_id is null;
