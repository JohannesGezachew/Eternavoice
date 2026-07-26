# Getting users to the value moment before the paywall

> Reference notes — captured 2026-07-27, not yet acted on. The goal: make sure
> people (especially cold, ad-sourced visitors) feel the product's value before
> being asked to pay. Nothing here is built; this is a menu of options and the
> tradeoffs, to revisit later.

## The value moment

The single most persuasive thing in the product is **hearing the recreated
voice reply to you personally** — ideally referencing something real from the
setup ("you still keep my tools in the garage?"). Everything about onboarding
should be measured by how fast and how reliably it gets someone to that line.

This is now technically supported: the audio narration step seeds the persona
from the 1.5-minute setup, so the *first* conversation can already be personal.
That first line is the sales pitch — protect it.

## Important correction to the framing

We are **already not** hitting people with the $30 wall first.

- `supabase/migrations/002_trial_on_signup.sql` defaults every new profile to
  `subscription_status = 'trialing'` with `trial_ends_at = now() + 7 days`.
- `src/middleware.ts` admits `trialing` (and `active`) users to all app routes;
  Stripe `/subscribe` only appears once the trial lapses.

So new users get **7 days free, no card**, and can clone + have full
conversations that whole week. The $30 screen is not the first thing they see.

## The real obstacle: the signup wall, not the payment wall

Current funnel for an ad-clicker:

```
Ad → landing → "Start" → MUST create account (email + 6-digit code) → clone → talk
```

The account wall sits **before** any experience of value. That — not the $30 —
is where a cold visitor drops. The middleware redirects any unauthenticated app
route to `/auth/login`, so cloning and talking are both behind auth.

## Why auth is there (don't remove it blindly)

Three real reasons the wall exists, all of which make a fully-anonymous
"clone + chat" demo non-trivial:

1. **Cost.** Cloning and conversation spend real money — ElevenLabs per voice +
   per character of TTS, OpenAI per reply/transcription. An open, anonymous
   clone endpoint is a direct cost + quota-abuse vector (bots, randoms).
2. **Identity / encryption.** Per-user data keys are derived from `user.id`
   (`deriveUserKey` in `src/lib/crypto.ts`). No account = no stable identity to
   encrypt and persist the voice + memories under. A pre-signup clone is
   effectively a throwaway that must be migrated onto the account at signup.
3. **Consent.** The "I have the right to use this voice" attestation matters
   *more* when the user is anonymous, not less.

## The options

### Option A — Reverse trial (highest conversion, most work)

Let them **land → record → clone → have a short, capped first conversation with
no account at all**, then gate on: *"Create a free account to keep [Name] and
keep talking."* They feel the value before any commitment. This is the
best-converting pattern for emotional, high-consideration products.

Required guardrails (non-negotiable, because cloning costs money):
- One clone per device/IP.
- Hard cap on the demo conversation (e.g. ~2 minutes or ~4 exchanges).
- Rate limiting on the clone + chat + TTS endpoints for anonymous sessions.
- A throwaway anonymous session identity, migrated to the real account on
  signup (voice, persona, memories carried over).
- Consent still required before the anonymous clone.

Cost: real engineering (anonymous sessions, identity migration, abuse
controls). Only worth it once data says the signup wall is the drop-off.

### Option B — Keep signup first, tighten + reassure (low work, do regardless)

- Make the trial promise **unmissable at the signup wall** — "Free for 7 days.
  No card. Cancel anytime." The landing says it; the login screen should too,
  so an ad-clicker knows they won't pay to try.
- The flow already auto-advances clone → talk; keep that seamless and let the
  narration-seeded first line do the selling.
- Optionally add a **zero-friction "sample voice" live demo** on the landing: a
  pre-made persona anyone can talk to for ~30 seconds without cloning.
  Proof-of-value for the hesitant, with no cost/abuse risk (one shared demo
  voice, tightly capped). Note: today's landing `ConversationDemo` is only a
  *scripted* animation, not a live talkable demo — this would be a real one.

### Option C — Status quo

Leave it. 7-day no-card trial behind a light email-code signup. Fine as a
baseline; the risk is losing cold ad traffic at the account wall before they
feel anything.

## Recommendation

1. **Do Option B now** — cheap, safe, and the signup wall may convert fine once
   the promise is loud and the first conversation lands.
2. **Measure the drop-off between "signed up" and "first conversation
   completed."** That single number tells you whether the wall or the value
   delivery is the problem.
3. **Only graduate to Option A (reverse trial) if the data says the signup wall
   is where people bail.** Higher ceiling, but only worth the engineering +
   abuse-control cost once it's proven to be the bottleneck.

Do **not** ship an anonymous "clone before signup" without the Option A
guardrails — every anonymous clone attempt spends real money, and an open
endpoint gets abused quickly.

## Metrics worth instrumenting first

- Landing → signup start → signup complete (where cold traffic drops).
- Signup complete → clone complete → **first conversation with ≥1 reply**
  (does the value moment actually get reached?).
- Trial → paid conversion, and time-to-subscribe.
- Ad source → any of the above, to see if ad traffic behaves differently.

## Relevant code (for whoever picks this up)

- `src/middleware.ts` — the auth + subscription gate; `BILLING_EXEMPT`,
  `SKIP_SUBSCRIPTION_CHECK`, trial logic.
- `supabase/migrations/002_trial_on_signup.sql` — the 7-day trial default.
- `src/components/people/NewPersonWizard.tsx` + `NarrationStep.tsx` — the
  clone/onboarding flow and the persona-seeding narration.
- `src/lib/crypto.ts` — per-user key derivation (the identity constraint for
  anonymous sessions).
- `src/components/landing/ConversationDemo.tsx` — the current scripted (not
  live) landing demo.
