# EternaVoice — V1 Magic-Moment Demo

Continuous voice conversations with someone you can no longer reach.

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

Sensitive keys are read server-side only via `src/lib/env.ts`.

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
  MediaRecorder (webm/opus or mp4)        → Voice clone engine
  AnalyserNode → live waveform            → returns voice_id
  Real-time quality scoring
                          ↓ blob
                          ────────────→   POST /api/transcribe
                                          → OpenAI gpt-4o-mini-transcribe
                                          → returns text

Conversation screen                       POST /api/chat (SSE)
  Composer (text + push-to-talk)          → OpenAI Chat Completions stream
  Streaming typewriter                    → Sentence buffer
  PlaybackQueue (decodeAudioData)         → Voice stream per sentence
  AnalyserNode → orb amplitude            → Interleaved text + audio SSE
                          ↑
              audio chunks (base64 mp3)
              text token deltas
```

### Sentence-level parallel streaming

See [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts).

1. Open OpenAI streaming.
2. As tokens arrive, emit `text` SSE events immediately and feed them
   into [`SentenceBuffer`](src/lib/sentences.ts).
3. The instant a sentence completes, kick off voice synthesis for it
   (parallel with the LLM continuing on the next sentence).
4. Drain TTS results in original sentence order, emitting one `audio`
   SSE event per completed sentence (full mp3 blob, base64).
5. The browser decodes each clip with `decodeAudioData` and schedules
   it gaplessly on a single `AudioContext` — see
   [`PlaybackQueue`](src/lib/audio/playbackQueue.ts).

### Targets, measured

| Metric | Target | Where it's enforced |
|---|---|---|
| First text token to UI | < 800 ms p50 | OpenAI streaming + immediate SSE forward |
| First audio byte to ear | < 2.0 s p50, < 3.0 s p95 | Sentence-level parallel TTS + per-sentence playback |
| Voice clone end-to-end | < 20 s | Voice clone engine + 25 MB upload cap |
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
    api/chat/route.ts           OpenAI + voice SSE
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
    voice client wrapper        Cached voice provider client + voice settings
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


## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript strict
- Tailwind CSS v4 with CSS-first config, custom design tokens
- Framer Motion 12 for choreography
- Zustand 5 for session state, sessionStorage-persisted
- Zod 4 for runtime request validation
- OpenAI SDK 6.x and the hosted voice SDK

## Brand notes

- Palette: deep ink `#0B0B0E` / warm bone `#F5EFE6` / restrained ember `#C7A27C`. Dark by default.
- Type: Fraunces (serif, expressive) + Inter (sans, neutral). Loaded at runtime via Google Fonts CSS.
- Motion: ease `[0.16, 1, 0.3, 1]`. Nothing bounces. Respects `prefers-reduced-motion`.
- Tone of voice: short, weighted, lowercase where it suits.
