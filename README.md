# EternaVoice

EternaVoice is a voice-clone chat app built with Next.js.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`, then go through:
**Begin → Read the script → Clone voice → Pick persona → Talk**

## Environment variables

Required:

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`

Optional defaults:

- `OPENAI_CHAT_MODEL=gpt-4o`
- `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`
- `ELEVENLABS_TTS_MODEL=eleven_turbo_v2_5`
- `ELEVENLABS_FALLBACK_TTS_MODEL=eleven_flash_v2_5`

Keys are read on the server through `src/lib/env.ts`.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run lint
npm run format
```

## How it works

- `/api/clone` creates a voice clone from the recorded sample.
- `/api/transcribe` converts voice input to text.
- `/api/chat` streams text and audio back over SSE.
- The client queues sentence audio for smooth playback (`src/lib/audio/playbackQueue.ts`).

## Rate limits

- `POST /api/clone`: 4 per 10 minutes
- `POST /api/chat`: 60 per hour
- `POST /api/transcribe`: 240 per hour

Implemented in `src/lib/rateLimit.ts` using the `ev_session` cookie.

## Project structure

```text
src/
  app/            pages and API routes
  components/     UI and feature components
  lib/            shared logic (env, streaming, audio, state, rate limits)
```

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4
- Framer Motion
- Zustand
- Zod
- OpenAI SDK + ElevenLabs SDK
