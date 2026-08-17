# Codebase review — 17 Aug 2026

Full read of the tree at commit `cd28e74` (164 tracked files, ~19k lines of source).
Findings only — **nothing here has been fixed yet.**

> Caveat: `node`/`npm` were not on the PATH when this review was done, so
> `npm run typecheck`, `npm run lint` and `npm test` were **not** executed.
> Everything below comes from reading the code. Re-run those three before
> acting on anything, and treat #3 as "lint probably already flags this".

Ordered by severity. Each item lists the exact file/line, why it matters, and
the intended fix.

---

## 1. `subjects.voice_id` is locked down in app code but not in the database

**Severity: high — cross-tenant voice access**

**Where:** `supabase/migrations/001_initial_schema.sql:63-67`, and the missing
counterpart to `supabase/migrations/004_lock_billing_columns.sql`.
Context: `src/lib/db/subjects.ts:55-64`, `src/lib/db/voiceOwnership.ts`.

`src/lib/db/subjects.ts:55-64` explains at length why `voice_id` must never be
caller-writable: `assertVoiceOwner` decides access by asking *"does a subject I
own carry this voice_id?"*, so being able to write that column means pointing
your own subject at someone else's cloned voice.

That reasoning is enforced **only in the server action**. The `subjects` RLS
policy is:

```sql
create policy "Users can manage their own subjects"
  on subjects for all
  using (auth.uid() = user_id);
```

Row-scoped, not column-scoped — and no migration revokes the default
`authenticated` UPDATE grant on the table. So a signed-in user can bypass the
server action entirely and talk to PostgREST directly with their own anon-key
JWT:

```
PATCH /rest/v1/subjects?id=eq.<their own subject id>
Authorization: Bearer <their own JWT>
{"voice_id": "<victim voice id>"}
```

RLS passes (it is their row, and `WITH CHECK` defaults to `USING`, so
`user_id` still can't be moved). `assertVoiceOwner` then returns `ok` for the
victim's voice, which unlocks:

- `POST /api/chat` — synthesize speech in a stranger's deceased relative's voice
- `POST /api/tts`, `POST /api/voice-preview` — same
- `DELETE /api/voices/[voiceId]` — **destroy** the victim's cloned voice at the provider

Exploitation needs the victim's ElevenLabs voice id, which isn't guessable —
but that is obscurity, not a control, and the id is shipped to the browser.
This is the same class of hole migration 004 closed for `profiles`; `subjects`
never got the same treatment.

**Fix:** new migration, mirroring 004's shape and its explanatory comment:

```sql
revoke update on public.subjects from anon, authenticated;
grant update (name, relationship, persona, updated_at, deleted_at)
  on public.subjects to authenticated;
```

Check first that nothing else writes `voice_id`/`voice_name`/`corpus_quality_score`
as the user — `src/app/api/clone/route.ts:129-148` currently does both the
insert and the update with the **user's** client, so it will need to move to the
service role (as `api/stripe/checkout` already did for `profiles`), or the
grant list needs widening for the insert path. `INSERT` is a separate grant
from `UPDATE`, so the insert at line 136 is unaffected; only the
`.update({ name, voice_name, ... })` at line 131 touches a revoked column.

**Also verify while in there:** `memories`, `conversations`, `turns`,
`session_summaries` all use the same `for all using (auth.uid() = user_id)`
shape. Confirm none of them has a column whose value the server later trusts
for an authorization decision. (`turns.user_id` and `conversations.user_id` are
protected by the default `WITH CHECK`; nothing else looked load-bearing.)

---

## 2. `/api/conversations/[id]/summarise` is completely unmetered

**Severity: high — uncapped cost, plus silent data loss**

**Where:** `src/app/api/conversations/[id]/summarise/route.ts`,
`src/components/conversation/ConversationExperience.tsx:265-297`

Three separate problems in one route.

**(a) No rate limit and no allowance.** It is the only money-spending route with
neither `checkRate` nor `consumeAllowance`. Compare `/api/chat` (both),
`/api/clone` (both), `/api/tts` (burst guard), `/api/transcribe` (burst guard).
It accepts `turns: max(400)` × `content: max(2000)` — roughly 800 KB of
transcript — into `gpt-4o-mini` with `max_tokens: 1500`, and additionally
re-reads and re-decrypts every existing `conversation`-type memory for the
subject on each call (lines 138-152).

**(b) The client fires it 3–4× per exit.** `ConversationExperience.tsx:265-279`
registers `beforeunload`, `pagehide` **and** `visibilitychange`, and the effect
cleanup calls `summarise()` too:

```ts
window.addEventListener("beforeunload", summarise);
window.addEventListener("pagehide", summarise);
document.addEventListener("visibilitychange", onVisibility);
return () => {
  summarise();                    // ← fires on every currentConversationId change
  ...
};
```

Closing a tab typically triggers several identical `sendBeacon` calls. On top of
that, the periodic path at line 284-297 fires every 8 turns. The route is
idempotent in its *effects* (summary upserts, facts de-dupe), so this is purely
wasted spend — but it is a multiplier on an already unmetered endpoint.

**(c) The OpenAI call is unguarded.** Line 53 `await openai().chat.completions.create(...)`
has no `try`/`catch`. A provider error becomes an unhandled 500. Because this
arrives by `navigator.sendBeacon` there is no retry and no way to surface it —
the session summary **and** that conversation's durable memories are lost
silently. This is the same failure mode the `maxDuration = 60` comment at
line 9-11 was added to prevent, left open on a different axis.

**Fix:**
- Add `checkRate({ scope: "summarise", windowMs: 60*60*1000, max: 60 })` keyed on `user.id`.
- Consider a monthly allowance scope, or fold it into `chat`.
- Collapse the client's exit handlers to one (`pagehide` alone covers mobile and
  desktop; drop `beforeunload`, and guard `visibilitychange` behind a
  "already summarised at this turn count" check — `lastSummarisedCountRef` is
  right there and already tracks it).
- Wrap the completion call and return `{ ok: false }` rather than throwing.

---

## 3. Stale `currentConversationId` in `runChatStream`

**Severity: medium — silent conversation-continuity regression**

**Where:** `src/components/conversation/ConversationExperience.tsx:357-491`
(dep array at line 490; the stale read is at line 401)

```ts
conversationId: currentConversationId ?? undefined,   // line 401
...
}, [voiceId, persona, memories, activeSubjectId,
    appendAssistantToken, appendAssistantAudio, setStatus]);   // line 490
```

`currentConversationId` is read but not in the deps. After `resetConversation()`
mints a new id (`session.ts:379-380`), the callback keeps the **old** id until
an unrelated dep (`persona`, `memories`) happens to change identity.

`/api/chat` uses that id to exclude the live conversation's own rolling summary
from the "previous sessions" context (`chat/route.ts:144-146`). With a stale id:

1. The *just-finished* conversation's summary is wrongly excluded — the user
   loses exactly the continuity they most expect.
2. Once the new conversation summarises itself (every 8 turns), its own summary
   comes back as a "Previous session" — the precise failure mode the comment at
   `chat/route.ts:135-138` was written to prevent.

There is no `eslint-disable` on this callback (unlike lines 137, 187, 315), so
`npm run lint` should already be reporting it via `react-hooks/exhaustive-deps`.
Worth checking what else that rule is currently flagging.

**Fix:** add `currentConversationId` to the dep array, or read it from
`useSession.getState()` inside the callback (the pattern already used in
`TalkGate.tsx:40` for the same class of problem).

---

## 4. `createServiceClient()` is dead code that lies about its privileges

**Severity: medium — landmine, not currently exploited**

**Where:** `src/lib/supabase/server.ts:28-48`

```ts
export async function createServiceClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // service role...
    { cookies: { getAll() { return cookieStore.getAll(); }, ... } }   // ...plus user cookies
  );
}
```

`createServerClient` with a cookie adapter will pick up the signed-in user's
session and use **that** access token for the `Authorization` header on
PostgREST requests. So this runs as the user with RLS fully applied, while
reading — at every call site — as though it bypasses RLS. A future "use the
service client so RLS doesn't block us" fix would appear to work in dev (where
RLS often coincidentally permits) and fail or under-permission in prod.

Nothing imports it today. Every genuine service-role caller correctly uses
`createClient` from `@supabase/supabase-js` with no cookies:
`api/stripe/webhook:13`, `api/stripe/checkout:18`, `api/user/delete:19`,
`lib/rateLimit:46`.

**Fix:** delete it. If a cookie-less service client helper is wanted, add one
that mirrors the four existing call sites.

---

## 5. Stripe webhook has no idempotency or ordering guard

**Severity: medium — can lock out a paying customer**

**Where:** `src/app/api/stripe/webhook/route.ts`

**(a) No ordering guard.** Stripe does not guarantee delivery order. A late
`invoice.payment_failed` arriving *after* the recovery sets
`subscription_status = 'past_due'` (lines 74-89), and nothing corrects it until
the next subscription event — so a customer who has paid sits behind the paywall.
`middleware.ts:112` admits only `active` and live `trialing`.

**(b) No idempotency.** Replays (Stripe retries on any non-2xx, and this route
returns 200 unconditionally so retries are rare — but manual replays from the
dashboard happen) re-apply state blindly.

**(c) Subscription events are keyed solely on metadata.**

```ts
const userId = sub.metadata?.supabase_user_id;
if (userId) { await upsertSubscriptionStatus(...) }   // else: silently dropped
```

`api/stripe/checkout/route.ts:71-73` sets that metadata, so checkout-created
subscriptions are fine. A subscription created from the Stripe **dashboard** has
no metadata and is dropped on the floor with no log. The `invoice.payment_failed`
branch already demonstrates the fix — look the profile up by
`stripe_customer_id` — it just isn't used for the subscription branches.

**Fix:**
- Fall back to `stripe_customer_id` lookup when `metadata.supabase_user_id` is absent; `console.error` if both fail.
- Store `event.created` (or a processed-event-id table) and ignore events older than the last applied one for that subscription.
- Consider handling `checkout.session.completed` for belt-and-braces linking.

---

## 6. `MASTER_ENCRYPTION_KEY` is unrotatable, despite the schema promising otherwise

**Severity: medium — operational/DR, plus misleading documentation**

**Where:** `src/lib/crypto.ts:18-20, 43-53`, `supabase/migrations/001_initial_schema.sql:12`

The schema says:

```sql
data_key_enc text,   -- AES-256 per-user data key, encrypted with master key
```

and `crypto.ts` exports `generateDataKey()`, `encryptDataKey()`,
`decryptDataKey()` to support exactly that indirection. **Nothing reads or
writes `profiles.data_key_enc`** (verified by grep across `src/` and `scripts/`).

The key actually in use is derived directly:

```ts
export function deriveUserKey(userId: string): Buffer {
  return createHmac("sha256", getMasterKey()).update(userId).digest();
}
```

So rotating `MASTER_ENCRYPTION_KEY` makes every conversation turn, memory, and
session summary permanently unreadable. `.env.example` warns about this
correctly ("NEVER rotate without migrating existing encrypted data first"), but
the schema comment claims the opposite ("so it can be rotated independently of
user IDs"), and the three unused crypto helpers imply the mechanism exists.

Note the blast radius is already visible in the code: `conversations.ts:75-86`
and `memories.ts:31-38` both have careful handling for undecryptable rows,
written to avoid *destroying* data when a key problem occurs. That machinery
exists because the recovery story is "there isn't one".

**Fix (pick one):**
- **Wire it up:** on first write per user, `generateDataKey()` → store
  `encryptDataKey(dk)` in `data_key_enc` → use that key for field encryption.
  Rotation then re-wraps N key blobs instead of re-encrypting every row.
- **Or be honest:** delete the three unused helpers and the `data_key_enc`
  column, and change the schema comment to match `.env.example`.

---

## 7. "End-to-end encrypted" on the landing page is not accurate

**Severity: medium — legal/regulatory exposure, trivial code change**

**Where:** `src/app/page.tsx:33-38`

```ts
const TRUST_SIGNALS = [
  "End-to-end encrypted",
  ...
];
```

The server holds the master key, derives the per-user key, and decrypts
plaintext on every chat turn (`chat/route.ts:134`, `152`, `167`). That is
server-side encryption at rest, not end-to-end — E2E means the server *cannot*
read it.

`src/app/privacy/page.tsx` describes the real thing correctly and carefully
("encrypted at rest with AES-256 using a key derived specifically for your
account, so they cannot be read from the database alone"). The homepage claim
contradicts the privacy policy, on a product handling bereavement data, in a
jurisdiction-sensitive category.

**Fix:** change the string to "Encrypted at rest" or "AES-256 encrypted" — both
true, both still strong. Check `Hero.tsx`, `Pillars.tsx`, `Faq.tsx` and
`about/page.tsx` for the same claim.

---

## 8. `/api/convert` hardcodes `/usr/bin/ffmpeg`

**Severity: low — broken fallback path, misleading error**

**Where:** `src/app/api/convert/route.ts:79`

```ts
await exec("/usr/bin/ffmpeg", [...]);
```

That path does not exist on Vercel lambdas, nor on Homebrew macOS
(`/opt/homebrew/bin/ffmpeg`). The `ENOENT` is caught by the inner handler at
line 99-105 and returned as:

> "We couldn't read that file. Try a different recording."

— blaming the user's file for a deployment gap.

Mitigating: this is only the *fallback*. `src/lib/audio/convertAudio.ts:108-120`
tries client-side Web Audio decoding first and only falls through for exotic
containers the browser can't decode.

**Fix:** resolve the binary from `process.env.FFMPEG_PATH ?? "ffmpeg"` (PATH
lookup), and if it's genuinely unavailable in the deploy target, return a
distinct message ("we can't convert that format here — try exporting as mp3 or
wav") rather than implying the recording is bad.

---

## 9. `persona` is accepted as unbounded arbitrary JSON

**Severity: low — data integrity / cheap DoS**

**Where:** `src/app/api/subjects/[id]/route.ts:10`, `src/lib/db/subjects.ts:67`

```ts
persona: z.record(z.string(), z.unknown()).optional(),
```

Every other field on both paths is length-capped (`name` 80, `relationship` 120).
`persona` is a free-form jsonb blob with no size or shape validation, writable
by any signed-in user against their own subject. It is then read back and fed
into `buildChatPrompt` (`chat/route.ts:293`) — though `/api/chat` re-validates
its own `persona` payload with a proper schema, so this is storage bloat rather
than prompt injection.

**Fix:** validate against the real `PersonaConfig` shape (the schema already
exists inline at `chat/route.ts:23-49` — worth extracting to `lib/types.ts` or
a shared `lib/schemas.ts` and reusing in all three places).

---

## Smaller observations (not tracked as issues)

- **Middleware cost.** `middleware.ts` runs `supabase.auth.getUser()` (a network
  call) plus a `profiles` select on essentially every request, including RSC
  prefetches. `/api/chat` then authenticates twice more (`assertVoiceOwner`,
  then again at line 132 for the memory read) — three auth round-trips on the
  latency-critical path. Caching the user per request would pay for itself.
- **Test coverage is thin where the risk is.** Six test files, all covering pure
  functions (crypto, prompts, utils, allowance math, extraction shaping).
  Nothing covers route handlers, the SSE/sentence/TTS pipeline, the session
  store, or RLS. Worse, `src/lib/entitlement.test.ts:10-18` **re-implements**
  the middleware's `hasAccess` and `BILLING_EXEMPT` rather than importing them —
  it will keep passing while `middleware.ts` drifts away from it. Extract the
  real functions and import them.
- **`saveConversation` write amplification.** `src/lib/db/conversations.ts:38-49`
  re-encrypts and upserts *every* turn on each 2-second debounce tick
  (`ConversationExperience.tsx:300-316`) — up to 80 row rewrites per save, each
  with a fresh IV.
- **`@stripe/stripe-js` is unused.** Checkout is a server-side redirect
  (`api/stripe/checkout/route.ts:80`); nothing in `src/` imports the client SDK.
  Drop the dependency.
- **`SentenceBuffer` treats `;` and `:` as terminals** (`src/lib/sentences.ts:9`),
  which chops mid-clause and gives TTS odd prosody on lists and appositives.
- **`/api/events` is billing-gated.** It's not in `BILLING_EXEMPT`
  (`middleware.ts:81-91`), so client error reporting returns 402 exactly when a
  lapsed user is hitting errors. It also `console.error`s full stack traces and
  arbitrary client-supplied context with no redaction (`api/events/route.ts:34`).
- **`BILLING_EXEMPT` uses bare `startsWith`.** `/accounts-anything` matches
  `/account`. No such route exists today; worth an exact-match or trailing-slash
  guard if the list grows.
- **CSP allows `script-src 'unsafe-inline'`** (`next.config.ts:28`), documented
  as a known follow-up. Real XSS surface is small — the only
  `dangerouslySetInnerHTML` is the theme pre-paint script in `layout.tsx:112`,
  which is a constant. Low priority, but it is the one remaining CSP gap.
- **`/api/user/delete` ignores every error.** `api/user/delete/route.ts:71-79`
  runs six deletes plus `auth.admin.deleteUser` with no error checking and
  returns `{ deleted: true }` unconditionally. All FKs cascade from
  `profiles(id)`, so the explicit deletes are belt-and-braces — but a partial
  failure is reported to the user as a completed GDPR erasure.

---

## Suggested order of work

1. **#1** — one migration, closes a cross-tenant hole. Check the `/api/clone` update path first.
2. **#3** — one-line dep-array fix.
3. **#2** — rate limit + `try`/`catch` + collapse the client exit handlers.
4. **#7** — one string.
5. **#4** — delete dead code.
6. **#5** — webhook robustness.
7. **#6** — decide: wire up `data_key_enc`, or delete it and fix the comment.
8. **#8**, **#9**, then the smaller observations.
