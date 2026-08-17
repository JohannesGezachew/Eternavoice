# Full review — security, correctness, UX, architecture, performance, cost

Five parallel reviews against `main`, plus automated tooling. Everything below was
verified against the actual code; findings the code already handles were dropped.

**Already fixed and shipped** (commit `b872c83`, needs migration 009): the items
marked ✅. Everything else is open.

---

## The five things that matter most

1. **The unit economics do not hold.** `MONTHLY_ALLOWANCE` is priced *above*
   breakeven. A user consuming what they were sold costs **$36–48/month against
   $30 revenue** — a gross margin of −22% to −60%.
2. **`/api/persona-extract` has no rate limit of any kind.** One $30 account can
   sustain **~$300/hour** of OpenAI spend. It is the only paid route with zero
   cost control.
3. ✅ **Cross-tenant voice takeover** — `subjects` had blanket INSERT+UPDATE, so
   `voice_id` was writable from the browser and `assertVoiceOwner` could be
   defeated. Fixed; **run migration 009**.
4. ✅ **Every conversation's last reply was being saved truncated** to its first
   sentence, by a stale closure in the debounced save.
5. ✅ **Decrypted transcripts survived sign-out** in localStorage and leaked to
   the next person to sign in on the same device.

---

## Security

Fixed this pass: the `subjects` grant hole (both INSERT and UPDATE), the dead
`createSubject` endpoint that took a caller-supplied `voiceId`, the sign-out
leak, and the false encryption claims.

**Still open, ranked:**

| Sev | Finding | Where |
|---|---|---|
| High | `/api/conversations/[id]/summarise` has no rate limit and no allowance; the OpenAI call sits outside any try/catch, so a provider error loses the summary *and* that conversation's memories with no retry | `summarise/route.ts` |
| Med | Stripe webhook has no idempotency and no ordering guard. A late `payment_failed` after recovery pins a paying customer at `past_due` for ever. Subscription events key only on metadata, so dashboard-created subscriptions are dropped silently | `stripe/webhook/route.ts:56-92` |
| Med | `createServiceClient` — service-role key wired to a *cookie* adapter, so it silently runs as the user while reading as though it bypasses RLS. Zero callers. Delete it | `lib/supabase/server.ts:28` |
| Med | GDPR export omits **readings**, session summaries, subjects and profile. The privacy page promises "everything held against your account" | `account/page.tsx:250`, `api/user/data` |
| Med | `/api/user/delete` runs six deletes with no error checking and returns `{deleted:true}` unconditionally. A partial failure is reported as a completed erasure; a failed ElevenLabs delete leaves the biometric voice alive at the provider | `user/delete/route.ts:71-81` |
| Med | `MASTER_ENCRYPTION_KEY` is unrotatable. `profiles.data_key_enc` and the three key-wrapping helpers are dead; the schema comment claims the opposite | `crypto.ts:43-53` |
| Med | `/api/events` logs unredacted client stacks and free-form context into Vercel logs — bereavement PII into a sink with different retention. Also billing-gated, so error reporting 402s exactly when a lapsed user hits errors | `api/events/route.ts:34` |
| Low | Dev scripts mint a permanent backdoor account with a hardcoded password using the service role. Run once against prod env and it is live | `scripts/ui-review.js:15` |
| Low | Operator scripts print decrypted memories to stdout | `scripts/rewrite-memory-voice.mjs` |
| Low | `/usr/bin/ffmpeg` hardcoded — fails on Vercel and blames the user's recording | `api/convert/route.ts:79` |
| Low | `persona` accepted as unbounded jsonb while every sibling field is capped | `api/subjects/[id]/route.ts:10` |

**Verified as genuinely safe** (do not "fix" these): the ffmpeg shell-out uses
`execFile` with an argv array and `-protocol_whitelist file`, closing the
SSRF-to-env-disclosure path; `usage_counters` is correctly locked with a
SELECT-only policy and revoked EXECUTE; CSRF is covered by SameSite=Lax plus
preflight; `safeInternalPath` handles open-redirect properly; no secret reaches
a `NEXT_PUBLIC_` var; prompt injection has no exfiltration channel.

---

## Correctness

Fixed this pass: truncated replies, starters never sending, the pause trap,
`stop()` not cancelling in-flight decodes, `onEnd` firing on cancellation, the
stuck reading on a failed final line, and the AudioContext teardown on rate change.

**Still open:**

- **Hydration race orphans an in-progress conversation.** `hydrateFromDb`
  replaces rather than merges, so a conversation created while `/api/user/data`
  is still loading vanishes from the store and **every save for the rest of the
  session is silently abandoned** by `if (!conv) return`. Twenty minutes of
  talking, lost, with no error. `session.ts:486`, `ConversationExperience.tsx:376`
- **One hung TTS call wedges the whole reply.** The drain loop has no timeout,
  so `done` is never sent and the client waits out its 45s abort.
  `chat/route.ts:290-324`
- **Status can stick on "thinking"** with the composer disabled and no error, if
  the SSE body ends without a `done` frame. `ConversationExperience.tsx:628`
- **`retryLast` leaves the failed partial reply in the transcript**, so one
  exchange ends up with two assistant turns.
- **Reopening a conversation from history fires a full re-summarise** — a
  gpt-4o-mini call on up to 400 turns, every time someone browses history.
- **Deleting a conversation does not make the persona forget it.**
  `session_summaries` has no `deleted_at` and is never filtered, so summaries of
  deleted conversations keep feeding the prompt. For a grief product this is a
  trust failure, not a perf issue.

---

## UX and accessibility

- **402 is handled nowhere.** A trial expiring mid-conversation produces
  "Something went wrong. Tap retry." for ever; the reading room renders the raw
  string `subscription_required` to a grieving user. The middleware comment says
  "the client routes to /subscribe itself" — no client code does.
- **"Keep going…" ends the recording.** Below 40s the button says keep going and
  the helper text says "you can stop after a minute", but tapping it stops the
  take. `NarrationStep.tsx:329`
- **A network blip says your dead relatives were deleted.** `PeopleLibrary`,
  `PersonHub` and `ReRecordVoice` all render "No one here yet" / "Person not
  found — They may have been removed" on a failed fetch. `/conversations` already
  solves this with `dbSettled`; these three never got it.
- **Deleting the entire account is two taps**, while deleting *one person*
  requires typing their name. The API already expects the literal string
  `DELETE MY ACCOUNT`; the UI never asks for it.
- **The default light theme fails WCAG AA broadly** — `--color-text-tertiary` is
  4.38:1 on light, `bone-dim/70` is 2.96:1. The token comment claiming ≥4.6:1 is
  only true in dark mode.
- **The most destructive button in the app is 2.72:1** — white on
  `--color-danger`. `PersonHub.tsx:454`
- **iOS Safari zooms on focus in 7 inputs.** `Field.tsx` documents the 16px rule;
  `--text-body` is 15px.
- **Twelve persistence failures are `.catch(console.error)`** — delete a
  conversation, watch it disappear, find it back after a reload.
- Uploaded audio is silently truncated to 60s; the parting-reflection modal has
  no focus trap; the mobile nav overlay traps nothing; the talk-room state
  caption is invisible to screen readers; `/demo` is behind the auth wall despite
  existing to be seen before signing up.

---

## Performance and cost

**Cost**

| Finding | Impact |
|---|---|
| Allowances above breakeven | $36–48 cost vs $30 revenue |
| `/api/persona-extract` unlimited | ~$300/hour per account |
| `/api/tts`, `/api/transcribe` have no monthly cap | ~$28k/month and ~$60/hour ceilings per account |
| Summarise fires 3–4× per exit, uncapped, O(N²) payload | wrong shape, ~$108/hour ceiling |
| `clone: 12`/user/month vs shared ElevenLabs voice slots | **55 users exhaust the whole account's voice capacity** |
| `eleven_flash_v2_5` is configured in `env.ts` and referenced nowhere | dead config, and the cheaper model |

**Latency** — reasoned p50 from user-stops-speaking to first audio is **≈3.2s**
against a claimed 2.0s. The instrumentation cannot see this: `startedAt` is set
*inside* the stream constructor, after seven sequential round trips, so every
reported timing excludes 200–900ms. Biggest wins: TTS is fully buffered per
sentence despite requesting `optimizeStreamingLatency: 4` (150–300ms given away
per turn); two of the seven round trips are removable; VAD end-of-silence is
520–760ms of deliberate dead air.

**Client**

- **The vendor bundle ships twice on 7 routes** — two byte-identical 374,877-byte
  chunks, ~104 kB gzip wasted on the onboarding path.
- **localStorage is rewritten synchronously on every store mutation** — ~330 kB
  of JSON, ~15 times per reply, 10–35ms of main-thread block each. The most
  likely cause of any audible stutter between sentences. The code comment already
  says localStorage is "a fast-path cache, not the record".
- **Zero `React.memo` anywhere**, and amplitude state updates ~60×/second,
  re-rendering a 2,000-line component and a `motion layout` transcript — 40 turns
  × 60fps = 2,400 forced layout measurements per second.
- Candlelight restarts a 1.6s opacity transition every frame on a full-viewport
  double-gradient layer.

**Database**

- `select("*, turns(*)")` with `.limit(200)` and **no limit on the embedded
  turns** — a heavy user pulls 8,000 ciphertext rows and decrypts every one, from
  **seven uncoordinated call sites**.
- Two unbounded fetch-and-decrypt loops (`remember.ts`, `summarise`) that grow
  O(N²) over a relationship's lifetime.
- Missing indexes on the hottest paths: `subjects(user_id, voice_id)`,
  `memories(user_id, subject_id, updated_at desc)`, `conversations(user_id,
  updated_at desc)`, `profiles(stripe_customer_id)`, `turns(user_id)`.
- Every RLS policy uses bare `auth.uid()` instead of `(select auth.uid())`, so
  it is re-evaluated per row rather than hoisted. **Cheapest win in the report.**

---

## Architecture and quality

- **Observability is effectively zero.** `trackEvent` is called 51 times and
  never leaves the browser — it writes to a 200-entry localStorage ring buffer.
  `reportError` covers 9 sites against 111 swallowed errors. If the summariser
  stopped writing memories tomorrow, nobody would know until a user emailed.
  **Sentry + PostHog is the highest-value two hours available.**
- **Testing is 192 green tests over ~6.7% of the codebase**, all pure functions.
  Zero coverage of the 22 route handlers, the middleware, the six `"use server"`
  modules, the zustand store, or any component. Recommended order: route-handler
  tests (no config change needed), then server-action tests, then Playwright for
  three flows — *then* decompose `ConversationExperience`.
- **`ConversationExperience.tsx` is 2,039 lines** and accounts for 9 of the 12
  lint errors. Three are "cannot access variable before declaration"; three more
  mean **the React Compiler bails on the whole component**, so the file that
  re-renders per streamed token gets no auto-memoization. Extract the four
  sub-components first (free, zero risk), then hooks by state ownership. Do not
  extract the streaming core.
- **`next build --webpack` fails** — `shapeExtraction` is exported from a
  `route.ts` purely so a test can import it. 15-minute fix, removes a latent
  build trap.
- **`updateQuality` is dead — and that is probably a live bug.** The recording
  quality hint is computed from a state nothing ever updates.
- Dead: `createServiceClient`, three crypto helpers, `updateSubject`,
  `deleteSubject`, `Surface.tsx`, the summarise `GET` handler,
  `@stripe/stripe-js`, `@eslint/eslintrc`. Signed-in users hit a double redirect
  via `/voices`.
- 141 `as` casts, nearly all hand-asserting Supabase row shapes. `supabase gen
  types` is ~2 hours and removes all of them. **`any` is effectively zero across
  23k lines** — genuinely good.
- 22 duplicated inline SVGs, the ElevenLabs drain loop copied 4×, 15 hand-rolled
  fetch trios, `/api/user/data` fetched from 7 uncoordinated places.
- `SKIP_SUBSCRIPTION_CHECK=true` disables billing entirely, is undocumented in
  `.env.example`, and has no production guard.

---

## Suggested order

**This week**
1. Run migration 009 *(already written)*.
2. Rate-limit `/api/persona-extract`, `/api/tts`, `/api/transcribe`, `/api/conversations/[id]/summarise`.
3. Decide the allowance/pricing question — the current numbers lose money.
4. Sentry + PostHog.
5. Handle 402 in both rooms.
6. One migration: five indexes, two dead indexes dropped, `(select auth.uid())` in every policy.

**Next**
7. Fix the unchecked writes in `summarise` and `stripe/webhook`.
8. Merge rather than replace in `hydrateFromDb`.
9. Light-theme contrast pass; the `text-white` on danger buttons.
10. Debounce localStorage; drop `conversations` from `partialize`.
11. `supabase gen types`; delete the dead code above.

**Then** route-handler tests → Playwright → decompose `ConversationExperience`.
