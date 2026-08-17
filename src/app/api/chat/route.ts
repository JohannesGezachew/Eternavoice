import { NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { elevenlabs, VOICE_SETTINGS } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { buildChatPrompt } from "@/lib/prompts";
import { SentenceBuffer } from "@/lib/sentences";
import { encodeSse, type ChatEvent } from "@/lib/sse";
import { checkRate, consumeAllowance } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { assertVoiceOwner } from "@/lib/db/voiceOwnership";
import { deriveUserKey, decryptField } from "@/lib/crypto";
import { rankMemoriesForPrompt, type RankableMemory } from "@/lib/memoryRanking";

export const runtime = "nodejs";
// Vercel Hobby caps function duration at 60s; replies typically finish in 5–20s.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MODEL_CONTEXT_TURNS = 30;
/** How many memories reach the prompt. */
const MEMORY_CONTEXT_LIMIT = 24;
/** How many are read before choosing — wide enough that hand-kept notes are
 *  always in the running, not just the newest rows. */
const MEMORY_FETCH_LIMIT = 400;

/** One sentence of speech, generously. Past this the provider is not answering. */
const TTS_SENTENCE_TIMEOUT_MS = 30_000;
/** Backstop for the drain loop once the model has finished. */
const DRAIN_TIMEOUT_MS = 45_000;

const Body = z.object({
  voiceId: z.string().min(8).max(64),
  persona: z.object({
    mode: z.enum(["self", "persona"]),
    name: z.string().max(120).default(""),
    relationship: z.string().max(160).optional(),
    description: z.string().max(2000).optional(),
    catchphrases: z.string().max(500).optional(),
    avoidPhrases: z.string().max(500).optional(),
    speechStyle: z
      .object({
        warmth: z.number().min(1).max(10),
        directness: z.number().min(1).max(10),
        expressiveness: z.number().min(1).max(10),
        humor: z.number().min(1).max(10),
        talkativeness: z.number().min(1).max(10),
      })
      .optional(),
    calibration: z
      .object({
        tooFormal: z.boolean().optional(),
        tooCheerful: z.boolean().optional(),
        tooManyQuestions: z.boolean().optional(),
        tooLong: z.boolean().optional(),
        notWarmEnough: z.boolean().optional(),
      })
      .optional(),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  memories: z
    .array(
      z.object({
        content: z.string().min(1).max(500),
      }),
    )
    .max(40)
    .optional(),
  subjectId: z.string().uuid().optional(),
  /** The conversation in progress, so its own running summary is never fed
   *  back as though it were a past session. */
  conversationId: z.string().uuid().optional(),
  /** First-ever conversation with this person: the persona gathers memory
   *  by asking to be reminded of the shared life. */
  firstMeeting: z.boolean().optional(),
  /** The user just barged in mid-reply — acknowledge the interruption. */
  recentlyInterrupted: z.boolean().optional(),
});

export async function POST(request: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // Never synthesize in a voice the caller doesn't own. This also gives us the
  // caller's id, which the per-user limits below are keyed on.
  const owner = await assertVoiceOwner(parsed.voiceId);
  if (!owner.ok) {
    return NextResponse.json(
      { error: owner.status === 401 ? "Unauthorized" : "That voice isn't yours." },
      { status: owner.status },
    );
  }

  // Burst guard — wide enough that ordinary conversation never reaches it;
  // catches a runaway client loop.
  const limit = await checkRate(
    { scope: "chat", windowMs: 60 * 60 * 1000, max: 200 },
    owner.userId,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That's a lot of replies at once — give it a moment." },
      { status: 429 },
    );
  }

  // Monthly allowance. Consumed here, before the reply is generated, because
  // this is the point where the request commits to spending money.
  const allowance = await consumeAllowance("chat", owner.userId);
  if (!allowance.ok) {
    return NextResponse.json(
      {
        error: "monthly_allowance_reached",
        scope: "chat",
        resetsAt: allowance.resetsAt,
      },
      { status: 429 },
    );
  }

  // Continuity context lives server-side: session summaries plus the stored
  // memories for this person. Merging DB memories here means the prompt never
  // depends on the client's local store being fresh — facts extracted from a
  // previous conversation reach the very next one, on any device.
  // The client sends what it has locally; the server reads the rest. Both feed
  // one pool that is ranked before anything reaches the prompt.
  const candidates: RankableMemory[] = (parsed.memories ?? [])
    .map((m) => ({ content: m.content.trim(), source: "manual" as const, updatedAt: Date.now() }))
    .filter((m) => m.content);

  // One client, one identity, resolved once.
  //
  // assertVoiceOwner above already validated the session and handed back the
  // caller's id; this block used to build a second client and call getUser()
  // again to learn the same thing — a third auth round trip on the request
  // whose entire job is to start speaking quickly. The middleware had already
  // made the first.
  const userId = owner.userId;
  const supabase = await createClient();

  /** What the persona should call them. Nameless is the old behaviour, and a
   *  fine fallback, so every failure here is silent. */
  const readSpeakerName = async (): Promise<string | undefined> => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      return data?.display_name?.trim() || undefined;
    } catch {
      return undefined;
    }
  };

  /** Everything this person carries in from before. Non-fatal throughout —
   *  a reply without continuity beats no reply. */
  const readSubjectContext = async (subjectId: string) => {
    const summaries: Array<{ summary: string; createdAt: string }> = [];
    const memories: RankableMemory[] = [];
    try {
      const key = deriveUserKey(userId);
      // Exclude the live conversation: it is summarised every few turns, so
      // without this the persona is handed a "Previous session" describing
      // the last five minutes and talks about the present as if it were a
      // past visit — eventually evicting all genuine cross-session context.
      let summaryQuery = supabase
        .from("session_summaries")
        .select("summary_enc, created_at")
        .eq("user_id", userId)
        .eq("subject_id", subjectId);
      if (parsed.conversationId) {
        summaryQuery = summaryQuery.neq("conversation_id", parsed.conversationId);
      }

      // Read wide, then choose. Fetching only the newest rows meant the
      // summariser's own output crowded out every memory the user kept by
      // hand — so the notes someone deliberately bookmarked were the ones
      // least likely to reach the persona.
      const [summaryResult, memoryResult] = await Promise.all([
        summaryQuery.order("created_at", { ascending: false }).limit(4),
        supabase
          .from("memories")
          .select("content_enc, memory_type, updated_at")
          .eq("user_id", userId)
          .eq("subject_id", subjectId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(MEMORY_FETCH_LIMIT),
      ]);

      for (const row of summaryResult.data ?? []) {
        try {
          const summary = decryptField(row.summary_enc, key);
          if (summary) summaries.push({ summary, createdAt: row.created_at });
        } catch {
          // undecryptable row — skip
        }
      }

      for (const row of memoryResult.data ?? []) {
        try {
          const content = decryptField(row.content_enc, key).trim();
          if (!content) continue;
          memories.push({
            content,
            source: row.memory_type === "conversation" ? "conversation" : "manual",
            updatedAt: new Date(row.updated_at).getTime(),
          });
        } catch {
          // undecryptable row — skip
        }
      }
    } catch {
      // Non-fatal — continue without server context
    }
    return { summaries, memories };
  };

  // Fanned out rather than awaited in turn. The name, the past sessions and
  // the memories have no bearing on one another, and running them in sequence
  // put three full round trips between the user finishing their sentence and
  // the model being asked for a first token.
  const [speakerName, subjectContext] = await Promise.all([
    readSpeakerName(),
    parsed.subjectId ? readSubjectContext(parsed.subjectId) : null,
  ]);
  const sessionSummaries = subjectContext?.summaries ?? [];
  candidates.push(...(subjectContext?.memories ?? []));

  // Everything the person kept by hand, plus the auto-captured facts that bear
  // on what is being said right now. De-duped case-insensitively, since the
  // client's local copy and the server's rows overlap.
  const seenMemory = new Set<string>();
  const deduped = candidates.filter((m) => {
    const key = m.content.toLowerCase();
    if (seenMemory.has(key)) return false;
    seenMemory.add(key);
    return true;
  });
  const recentText = parsed.messages.slice(-6).map((m) => m.content).join(" ");
  const chosenMemories = rankMemoriesForPrompt(
    deduped,
    recentText,
    MEMORY_CONTEXT_LIMIT,
  ).selected.map((m) => m.content);

  // A real UUID — this becomes the assistant turn's id in the client store
  // and, from there, a uuid primary key in the turns table.
  const turnId = crypto.randomUUID();

  /**
   * The user closed the tab, hit interrupt, or walked out of signal.
   *
   * Nothing checked for this, so a reply nobody would ever hear ran to
   * completion anyway — the full model completion, plus ElevenLabs synthesis
   * of every remaining sentence, all of it billed. On a product whose margin
   * is already thin, the reply that gets abandoned halfway is not rare.
   */
  let clientGone = false;

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      clientGone = true;
    },
    async start(controller) {
      const startedAt = Date.now();
      const send = (event: ChatEvent) => {
        try {
          controller.enqueue(encodeSse(event));
        } catch {
          // controller already closed
        }
      };
      const sendTiming = (label: string) => {
        send({ type: "timing", turnId, label, elapsedMs: Date.now() - startedAt });
      };

      const ttsQueue: Array<{
        index: number;
        pauseMs: number;
        promise: Promise<Buffer | null>;
      }> = [];
      let drainStarted = false;
      let llmDone = false;
      let audioChunksSent = 0;
      let ttsFailures = 0;
      let firstTextSent = false;
      let firstTtsStarted = false;
      let firstAudioSent = false;
      let drainResolve: (() => void) | null = null;
      const drainComplete = new Promise<void>((resolve) => {
        drainResolve = resolve;
      });

      const drain = async () => {
        if (drainStarted) return;
        drainStarted = true;
        let nextIndex = 0;
        while (true) {
          if (clientGone) break;
          const next = ttsQueue.find((e) => e.index === nextIndex);
          if (!next) {
            if (llmDone && ttsQueue.every((e) => e.index < nextIndex)) break;
            await new Promise((r) => setTimeout(r, 10));
            continue;
          }
          try {
            const audio = await next.promise;
            if (audio && audio.byteLength > 0) {
              audioChunksSent += 1;
              if (!firstAudioSent) {
                firstAudioSent = true;
                sendTiming("server_first_audio_sent");
              }
              send({
                type: "audio",
                turnId,
                sentenceIndex: nextIndex,
                mime: "audio/mpeg",
                base64: audio.toString("base64"),
                pauseMs: next.pauseMs,
              });
            }
          } catch {
            ttsFailures += 1;
            // skip; other sentences continue
          } finally {
            nextIndex += 1;
          }
        }
        drainResolve?.();
      };

      /**
       * A sentence's audio, or null — but never a promise that hangs.
       *
       * The drain awaits each sentence in order, so one ElevenLabs read that
       * stalls without erroring stops the whole reply: nothing after it is
       * sent, `done` never fires, and the response body stays open until the
       * platform eventually kills the function. The client sat on "thinking"
       * the entire time. A sentence is a few seconds of speech; if it has not
       * arrived in thirty, it is not coming.
       */
      const ttsForSentence = async (text: string): Promise<Buffer | null> => {
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(), TTS_SENTENCE_TIMEOUT_MS);
        try {
          return await Promise.race([
            synthesise(text, deadline.signal),
            new Promise<null>((resolve) => {
              deadline.signal.addEventListener("abort", () => resolve(null), { once: true });
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };

      const synthesise = async (text: string, signal: AbortSignal): Promise<Buffer | null> => {
        try {
          if (!firstTtsStarted) {
            firstTtsStarted = true;
            sendTiming("server_first_tts_started");
          }
          const client = elevenlabs();
          const audioStream = await client.textToSpeech.stream(parsed.voiceId, {
            text,
            modelId: env.ELEVENLABS_TTS_MODEL,
            outputFormat: "mp3_44100_64",
            voiceSettings: VOICE_SETTINGS,
            optimizeStreamingLatency: 4,
          });
          const reader = (audioStream as ReadableStream<Uint8Array>).getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
            // The race above already resolved null; keep reading past that and
            // this holds a provider connection open for nothing.
            if (signal.aborted) {
              void reader.cancel().catch(() => null);
              return null;
            }
          }
          const total = chunks.reduce((s, c) => s + c.byteLength, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.byteLength;
          }
          return Buffer.from(merged);
        } catch {
          ttsFailures += 1;
          return null;
        }
      };

      send({ type: "ready" });
      sendTiming("server_stream_ready");
      void drain();

      const systemPrompt = buildChatPrompt(
        parsed.persona,
        chosenMemories.map((content) => ({ content })),
        sessionSummaries,
        Boolean(parsed.firstMeeting),
        Boolean(parsed.recentlyInterrupted),
        speakerName,
      );
      const sentences = new SentenceBuffer();
      let rawText = "";
      let fullText = "";
      let sentenceCount = 0;

      const enqueueSentence = (sentence: string) => {
        const polished = humanizeSentence(sentence, parsed.persona, Boolean(parsed.firstMeeting));
        if (!polished) return;
        const index = sentenceCount++;
        fullText = `${fullText}${fullText ? " " : ""}${polished}`.trim();
        if (!firstTextSent) {
          firstTextSent = true;
          sendTiming("server_first_text_sent");
        }
        send({ type: "text", turnId, delta: `${polished} ` });
        ttsQueue.push({
          index,
          pauseMs: naturalPauseMs(polished),
          promise: ttsForSentence(polished),
        });
      };

      try {
        const response = await openai().chat.completions.create({
          model: env.OPENAI_CHAT_MODEL,
          stream: true,
          temperature: 0.75,
          max_tokens: parsed.firstMeeting
            ? 110 // room for a reaction plus the remembering question
            : parsed.persona.speechStyle?.talkativeness &&
                parsed.persona.speechStyle.talkativeness >= 7
              ? 130
              : 75,
          messages: [
            { role: "system", content: systemPrompt },
            ...parsed.messages
              .slice(-MODEL_CONTEXT_TURNS)
              .map((m) => ({ role: m.role, content: m.content })),
          ],
        });

        for await (const chunk of response) {
          if (clientGone) break;
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (!delta) continue;
          rawText += delta;
          const ready = sentences.push(delta);
          for (const s of ready) enqueueSentence(s);
        }

        const tail = sentences.flush();
        if (tail) enqueueSentence(tail);
        if (!fullText && rawText.trim()) enqueueSentence(rawText.trim());

        llmDone = true;
        // Bounded. Everything queued has its own timeout, so this is the
        // backstop for the drain loop itself — `done` has to be sent, because
        // its absence is what leaves the room stuck mid-reply.
        await Promise.race([
          drainComplete,
          new Promise<void>((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS)),
        ]);
        if (fullText.trim() && sentenceCount > 0 && audioChunksSent === 0) {
          send({
            type: "notice",
            stage: "tts",
            message:
              "I could write the reply, but the voice audio failed for this turn.",
          });
        } else if (ttsFailures > 0) {
          send({
            type: "notice",
            stage: "tts",
            message: "Part of the voice audio failed, so the reply may sound incomplete.",
          });
        }
        send({ type: "done", turnId, full: fullText.trim() });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not generate a reply.";
        send({ type: "error", stage: "llm", message });
        llmDone = true;
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

const GENERIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bthank you for sharing that\b/gi, "I hear you"],
  [/\byour feelings are valid\b/gi, "that makes sense"],
  [/\bi'?m here to support you\b/gi, "I'm here"],
  [/\bthat sounds (really |so )?difficult\b/gi, "that's a lot"],
  [/\bi understand how you feel\b/gi, "I hear you"],
  [/\bas an ai\b/gi, ""],
];

function humanizeSentence(
  sentence: string,
  persona: z.infer<typeof Body>["persona"],
  firstMeeting = false,
): string {
  let next = sentence.replace(/\s+/g, " ").trim();
  if (!next) return "";

  for (const [pattern, replacement] of GENERIC_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  for (const phrase of splitLines(persona.avoidPhrases)) {
    next = next.replace(new RegExp(escapeRegExp(phrase), "gi"), "").replace(/\s+/g, " ").trim();
  }

  next = next.replace(/!+/g, ".");

  const calibration = persona.calibration;
  const talkativeness = persona.speechStyle?.talkativeness ?? 3;
  const maxLength = calibration?.tooLong || talkativeness <= 4 ? 150 : 220;
  if (next.length > maxLength) {
    const cut = next.slice(0, maxLength);
    next = cut.slice(0, Math.max(cut.lastIndexOf(","), cut.lastIndexOf("."), cut.lastIndexOf(" "))).trim();
    if (next && !/[.?!…]$/.test(next)) next += "...";
  }

  // The anti-interrogation filter flattens trailing questions — but during
  // the first-meeting interview, questions ARE the conversation.
  const questionCount = (next.match(/\?/g) ?? []).length;
  if (!firstMeeting && (calibration?.tooManyQuestions || questionCount > 0) && next.endsWith("?")) {
    next = next.replace(/\?+$/, ".");
  }

  if (Math.random() < fillerChance(persona)) {
    next = `${pickFiller(persona)} ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
  }

  return next.trim();
}

function naturalPauseMs(text: string): number {
  const base = text.includes("...") || text.includes("—") ? 180 : 120;
  const emotional = /\b(miss|sorry|love|gone|died|death|alone|afraid|hurt)\b/i.test(text) ? 260 : 0;
  return Math.min(650, base + emotional + Math.floor(Math.random() * 120));
}

function fillerChance(persona: z.infer<typeof Body>["persona"]): number {
  const expressiveness = persona.speechStyle?.expressiveness ?? 4;
  return expressiveness >= 7 ? 0.16 : 0.08;
}

function pickFiller(persona: z.infer<typeof Body>["persona"]): string {
  const custom = splitLines(persona.catchphrases).filter((phrase) => phrase.length <= 24);
  const options = custom.length ? [...custom, "mm.", "yeah.", "right."] : ["mm.", "yeah.", "right.", "I know."];
  return options[Math.floor(Math.random() * options.length)] ?? "mm.";
}

function splitLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
