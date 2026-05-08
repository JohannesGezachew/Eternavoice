# EternaVoice — V1 Magic-Moment Demo

Continuous voice conversations with someone you can no longer reach.
Built from what they left behind. This repository is the **Phase 1
magic-moment demo** from the V1 Engineering Brief: record a voice in
the browser, instantly clone it via ElevenLabs IVC, and have a
streaming voice conversation in that voice powered by OpenAI.

**What this build is.** A polished, mobile-first web experience that
ends in a 10-minute conversation with the cloned voice, sub-2 s p50
turn latency, and a UI engineered to feel premium enough to land the
pitch.

**What this build deliberately is not.** No auth, no Stripe, no
multi-subject, no four-tier persistent memory, no vector DB, no native
apps. Those land in Phase 2 / Phase 3.

---

## Quick start

```bash
cp .env.example .env.local        # fill in OPENAI_API_KEY and ELEVENLABS_API_KEY
npm install
npm run dev
```

Then visit `http://localhost:3000` and follow the flow:
**Begin → Read the script → Make the clone → Choose persona mode → Talk.**

### Required environment variables

| Var | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | Chat + transcription | — *(required)* |
| `ELEVENLABS_API_KEY` | IVC cloning + streaming TTS | — *(required)* |
| `OPENAI_CHAT_MODEL` | Conversation model | `gpt-4o` |
| `OPENAI_TRANSCRIBE_MODEL` | Voice-input STT | `gpt-4o-mini-transcribe` |
| `ELEVENLABS_TTS_MODEL` | TTS model | `eleven_turbo_v2_5` |
| `ELEVENLABS_FALLBACK_TTS_MODEL` | Latency fallback | `eleven_flash_v2_5` |

Sensitive keys are read server-side only via `src/lib/env.ts`. Never
exposed to the client.

### Scripts

```bash
npm run dev         # Turbopack dev server
npm run build       # Production build
npm run start       # Run the production build
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # next lint
npm run format      # prettier --write .
```

---

## Architecture

```
Browser                                   Server (Next.js Route Handlers)
─────────────────────────                 ─────────────────────────────
Recording screen                          POST /api/clone
  MediaRecorder (webm/opus or mp4)        → ElevenLabs IVC
  AnalyserNode → live waveform            → returns voice_id
  Real-time quality scoring
                          ↓ blob
                          ────────────→   POST /api/transcribe
                                          → OpenAI gpt-4o-mini-transcribe
                                          → returns text

Conversation screen                       POST /api/chat (SSE)
  Composer (text + push-to-talk)          → OpenAI Chat Completions stream
  Streaming typewriter                    → Sentence buffer
  PlaybackQueue (decodeAudioData)         → ElevenLabs TTS stream per sentence
  AnalyserNode → orb amplitude            → Interleaved text + audio SSE
                          ↑
              audio chunks (base64 mp3)
              text token deltas
```

### Sentence-level parallel streaming

The latency target is won here. See [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts).

1. Open OpenAI streaming.
2. As tokens arrive, emit `text` SSE events immediately and feed them
   into [`SentenceBuffer`](src/lib/sentences.ts).
3. The instant a sentence completes, kick off ElevenLabs TTS for it
   (parallel with the LLM continuing on the next sentence).
4. Drain TTS results in original sentence order, emitting one `audio`
   SSE event per completed sentence (full mp3 blob, base64).
5. The browser decodes each clip with `decodeAudioData` and schedules
   it gaplessly on a single `AudioContext` — see
   [`PlaybackQueue`](src/lib/audio/playbackQueue.ts).

We use `decodeAudioData` per sentence instead of `MediaSource
Extensions` because:

- iOS Safari has historically been flaky with chunked MP3 in MSE,
  whereas `decodeAudioData` is universally supported (iOS 14.5+).
- Sentence-sized buffers are tiny (~10–30 KB), so the cost of waiting
  for a full sentence's MP3 instead of streaming within a sentence is
  ~150–300 ms — already inside the budget.
- An `AnalyserNode` fed by the same playback context drives the orb
  visualiser, which is the single biggest "alive" cue.

### Targets, measured

| Metric | Target | Where it's enforced |
|---|---|---|
| First text token to UI | < 800 ms p50 | OpenAI streaming + immediate SSE forward |
| First audio byte to ear | < 2.0 s p50, < 3.0 s p95 | Sentence-level parallel TTS + per-sentence playback |
| Voice clone end-to-end | < 20 s | ElevenLabs IVC + 25 MB upload cap |
| 10-minute continuous conversation | Stable | 12-turn working memory, no DB |

### Rate limits (per session cookie, in-memory)

| Endpoint | Limit |
|---|---|
| `POST /api/clone` | 4 / 10 min |
| `POST /api/chat` | 60 / hour |
| `POST /api/transcribe` | 240 / hour |

Cookie is `ev_session`, set on first request, HttpOnly, SameSite=Lax.
See [`src/lib/rateLimit.ts`](src/lib/rateLimit.ts).

---

## Project layout

```
src/
  app/
    layout.tsx                  Root layout, fonts, background
    page.tsx                    Landing
    record/page.tsx             Step 1
    persona/page.tsx            Step 2
    conversation/page.tsx       Step 3
    api/clone/route.ts          IVC clone (multipart)
    api/chat/route.ts           OpenAI + ElevenLabs SSE
    api/transcribe/route.ts     gpt-4o-mini-transcribe
    error.tsx, not-found.tsx, loading.tsx
  components/
    landing/                    Hero, Pillars
    recording/                  Waveform, Script, RecordControl, QualityHint, RecordExperience
    persona/                    PersonaSetup
    conversation/               ConversationExperience, Orb, Message, Composer, StatusLine
    shell/                      Nav, Mark, BackgroundCanvas
    ui/                         Button, Surface, Field
  lib/
    env.ts                      Server-only env access
    openai.ts                   Cached OpenAI client
    elevenlabs.ts               Cached ElevenLabs client + voice settings
    prompts.ts                  System-prompt assembly with hard rules
    sentences.ts                Streaming sentence buffer
    sse.ts                      Wire types + encoder
    streamChat.ts               Client SSE consumer
    rateLimit.ts                In-memory per-session limiter
    session.ts                  Zustand store (sessionStorage-persisted)
    types.ts                    Shared types (no client/server side)
    motion.ts                   Easings + variants
    utils.ts                    cn, clamp, formatSeconds, delay
    clone/script.ts             The reading script
    audio/recorder.ts           MediaRecorder + analyser
    audio/quality.ts            RMS/peak/noise classifier
    audio/playbackQueue.ts      Web Audio playback queue + amplitude tap
```

---

## Demo runbook

### Before you walk into the room

1. **Devices**: laptop primary, phone as backup. Both on the same
   network. Test on both within the last hour.
2. **Mic**: a directional dynamic mic if you have one (SM7B / podcaster
   mic). Even AirPods Pro beats most laptop mics. The clone is only as
   good as the take.
3. **Browser**: Chrome or Safari, current. Not in private/incognito —
   that breaks `sessionStorage` persistence.
4. **Tabs**: one tab open on `/`. Audio tested by listening to the
   first reply yourself end-to-end. Volume at 70 %.
5. **Backup video**: record a polished walkthrough at home and have it
   queued. If the demo network dies, you don't.
6. **Quiet space**: close every tab that makes noise. Do-not-disturb.
   Phone on silent.

### The five-minute live flow

1. **Open the landing page** on the laptop. Don't say anything yet —
   let the hero land.
2. **Press Begin → Tap to record.** Read the script slowly. Don't
   perform; just read. Watch the quality hint settle to "Sounds
   clean".
3. **Stop, listen back, approve.** If it's noisy or thin, re-record —
   you have ten seconds of buffer in the room before it gets awkward,
   and a great clone is worth the pause.
4. **Make the clone.** This takes ~10–15 s. The orb fades in.
5. **Pick "Someone specific"**, give a name, a relationship, a few
   honest lines. (Or just use "A clone of you" for the simplest take.)
6. **Begin the conversation.** Type the first thing yourself, e.g.
   *"Hi, Dad."* Wait for the reply. The first sentence should reach
   the speakers around 1.5–2 s after you press send.

### When something goes wrong

| Symptom | First fix |
|---|---|
| Clone never finishes | Check `ELEVENLABS_API_KEY` quota; retry; if still failing, re-record at lower bitrate |
| First reply > 5 s | Check OpenAI region latency; switch `OPENAI_CHAT_MODEL=gpt-4o-mini` for the demo |
| Clone sounds robotic | The take was thin — re-record with more voice variety; tweak `VOICE_SETTINGS.stability` to 0.4 |
| Audio doesn't play on iOS | The first user interaction must be a tap that calls send — that unlocks the AudioContext. If it's silent on iOS, send a typed message first, not a voice message |
| Composer hidden behind keyboard | Already handled with `safe-area-inset-bottom`. If still cropped, scroll once and the layout snaps |
| Server crashes | Reload — sessionStorage keeps `voice_id`, persona, and turns, so the conversation survives |

### Knobs you can turn live

- **`VOICE_SETTINGS`** in [`src/lib/elevenlabs.ts`](src/lib/elevenlabs.ts):
  `stability` lower = more emotive, higher = more consistent. `style`
  raises the original speaker's traits. Defaults are tuned conservative.
- **`max_tokens`** in [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts):
  480 keeps replies short and conversational. Drop to 300 if the persona
  is monologuing.
- **`temperature`**: 0.85 for warmth. Drop to 0.7 if the persona drifts.
- **`OPENAI_CHAT_MODEL`**: swap to `gpt-4o-mini` for cheaper, faster
  responses if you're worried about cost or latency on the day.

---

## Verification done

- `tsc --noEmit` clean (strict, `noUncheckedIndexedAccess` on).
- `next lint` clean.
- `next build` succeeds with Turbopack.
- All routes scaffolded: `/`, `/record`, `/persona`, `/conversation`,
  `/api/clone`, `/api/chat`, `/api/transcribe`, plus `error.tsx`,
  `not-found.tsx`, `loading.tsx`.

## Verification still owed (do these on your machine, with real keys)

These need real API keys + a real microphone, so they're for the
operator to run, not CI:

1. **Real-clone latency**: record the script, measure wall-clock from
   "Make the clone" to the conversation screen rendering. Target
   < 20 s.
2. **First-reply latency**: type "Hello" in the conversation. Measure
   from press-Enter to first audible byte. Target < 2 s p50.
3. **Voice realism**: blind A/B the clone against the source recording
   for 60 s of conversation. If it sounds off, increase the recording
   length to the full 90 s of the script.
4. **Mobile**: open the same URL on iPhone and Android. Run the
   record-clone-converse loop. The composer should not get hidden by
   the keyboard. Push-to-talk should work.
5. **Backup video**: record the whole flow with `screen + audio` and
   keep it in your downloads folder for the live demo.

---

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript strict
- Tailwind CSS v4 with CSS-first config, custom design tokens
- Framer Motion 12 for choreography
- Zustand 5 for session state, sessionStorage-persisted
- Zod 4 for runtime request validation
- `openai` 6.x and `@elevenlabs/elevenlabs-js` 2.x

## Brand notes

- Palette: deep ink `#0B0B0E` / warm bone `#F5EFE6` / restrained ember
  `#C7A27C`. Dark by default. Calmness comes from contrast restraint.
- Type: Fraunces (serif, expressive) + Inter (sans, neutral). Loaded
  at runtime via Google Fonts CSS so the build is offline-safe.
- Motion: ease `[0.16, 1, 0.3, 1]`. Nothing bounces. Respects
  `prefers-reduced-motion`.
- Tone of voice: short, weighted, lowercase where it suits. The V1
  scope document is the source.
