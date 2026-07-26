import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  transcript: z.string().min(1).max(12000),
  name: z.string().min(1).max(80),
  relationship: z.string().max(120).optional(),
  // "self" = the speaker is describing themselves; "persona" = describing
  // someone they've lost. Shapes the voice the memories are written in.
  mode: z.enum(["self", "persona"]).default("persona"),
});

/** What the model returns; every field optional so a thin narration still parses. */
const Extracted = z.object({
  description: z.string().max(600).optional(),
  relationship: z.string().max(120).optional(),
  catchphrases: z.string().max(600).optional(),
  speechStyle: z
    .object({
      warmth: z.number(),
      directness: z.number(),
      expressiveness: z.number(),
      humor: z.number(),
      talkativeness: z.number(),
    })
    .partial()
    .optional(),
  memories: z.array(z.string().max(240)).max(12).optional(),
});

const clamp = (n: unknown, fallback = 5): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(10, Math.max(0, Math.round(v)));
};

/**
 * Turn a free-spoken 2-3 minute narration about a person into a structured
 * persona: a short characterisation, inferred speech-style dials, phrases they
 * used, and a handful of durable memories. The memories are written in the
 * persona's own voice (first person "I", addressing the speaker as "you") so
 * they read naturally when the recreated voice recalls them later.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const isSelf = body.mode === "self";
  const who = isSelf
    ? `The speaker is describing themselves — the voice being created is their own.`
    : `The speaker is describing ${body.name}${body.relationship ? ` (${body.relationship})` : ""}, someone dear to them whose voice is being recreated.`;

  const system = [
    "You help build a warm, accurate persona for a voice-companion app from a short spoken narration.",
    who,
    "You are writing notes the recreated voice (the Persona) will read to itself later. Write from the Persona's point of view: the Persona is \"I\"; the person speaking is \"you\". Never use the words \"the user\" or \"the persona\".",
    "Return JSON with these keys:",
    `- "description": one or two plain sentences capturing who ${isSelf ? "you are" : `${body.name} is`} and how ${isSelf ? "you come across" : "they come across"} — grounded only in what was said. No flattery, no invention.`,
    isSelf
      ? '- "relationship": omit or empty.'
      : '- "relationship": a short label for who they are to the speaker (e.g. "My father") if it is stated or clearly implied; otherwise omit.',
    '- "speechStyle": integers 0-10 inferred from how they were described — {"warmth","directness","expressiveness","humor","talkativeness"}. If a trait is not evidenced, use 5.',
    '- "catchphrases": things they actually said or a way of speaking that was mentioned, as a short newline-separated list. Omit if none were mentioned.',
    `- "memories": 0-10 short, durable, first-person facts worth carrying into every future conversation — names, relationships, shared history, what mattered, what they never want forgotten. One sentence each, under 200 characters, in the Persona's voice (e.g. "I taught you to fish on Saturday mornings."). Only what was actually said; never invent.`,
  ].join("\n");

  let extracted: z.infer<typeof Extracted> = {};
  try {
    const response = await openai().chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      max_tokens: 900,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: body.transcript },
      ],
    });
    const raw = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    extracted = Extracted.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Could not read that narration. You can try again, or fill things in yourself." },
      { status: 502 },
    );
  }

  const persona = {
    description: extracted.description?.trim() || undefined,
    relationship: isSelf ? undefined : extracted.relationship?.trim() || undefined,
    catchphrases: extracted.catchphrases?.trim() || undefined,
    speechStyle: {
      warmth: clamp(extracted.speechStyle?.warmth),
      directness: clamp(extracted.speechStyle?.directness),
      expressiveness: clamp(extracted.speechStyle?.expressiveness),
      humor: clamp(extracted.speechStyle?.humor),
      talkativeness: clamp(extracted.speechStyle?.talkativeness),
    },
  };

  const memories = (extracted.memories ?? [])
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .slice(0, 10);

  return NextResponse.json({ persona, memories });
}
