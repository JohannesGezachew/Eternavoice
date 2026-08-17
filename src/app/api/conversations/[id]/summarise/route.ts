import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";
import { isAutoTitle, normaliseTitle } from "@/lib/conversations";
import { openai } from "@/lib/openai";
import { env } from "@/lib/env";

export const runtime = "nodejs";
// A long transcript through gpt-4o-mini routinely exceeds the 10s default,
// and this arrives by unload beacon — a timeout loses the summary AND the
// memories with no retry and no way to tell the user.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  turns: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    .min(1)
    .max(400),
  subjectId: z.string().uuid().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Told to the summariser so it writes "you" instead of reaching for the name
  // it can see in the transcript.
  let speakerName: string | undefined;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    speakerName = (data?.display_name as string | null)?.trim() || undefined;
  } catch {
    // falls back to the nameless instruction below
  }

  const transcript = body.turns
    .map((t) => `${t.role === "user" ? "User" : "Persona"}: ${t.content}`)
    .join("\n");

  // One call, two artifacts: the session summary (continuity between
  // conversations) and durable facts (memories the persona carries forever).
  const response = await openai().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are a memory assistant for a voice-companion app. The transcript is between the Persona (a recreated voice of someone dear) and the person speaking with them. You are writing notes the Persona will read to itself later, so write from the Persona's point of view: call the person speaking \"you\", and call the Persona \"I\". Never use the words \"the user\" or \"the persona\".",
          // Naming the speaker explicitly is what stops the model writing about
          // them in the third person. Left to itself it picks their name out of
          // the transcript and produces "Safa mentioned a topic called X" —
          // which the Persona then reads back as a note about a stranger.
          speakerName
            ? `The person speaking is called ${speakerName}. Never write about them in the third person or by name — "${speakerName} mentioned" is wrong, "You mentioned" is right. Their name belongs in a memory only when the fact is about the name itself.`
            : "Never write about the person speaking in the third person or by name. \"Anna mentioned\" is wrong, \"You mentioned\" is right.",
          "Return JSON with exactly three keys:",
          '- "title": three to six words naming what this conversation was actually about, like a chapter heading — "The garden, and Dad\'s tools", "Her first week at school". Concrete and specific to this conversation. No quotation marks, no date, no greeting, and never a generic label like "Catching up".',
          '- "summary": a concise 3-5 sentence summary of what you talked about, the emotional tone, and anything worth following up on next time, written from the Persona\'s point of view (e.g. "You told me about a hard week at work, and I listened."). Specific, never generic.',
          '- "facts": an array of 0-20 short, durable, declarative facts worth remembering across all future conversations. Be thorough — capture every specific, lasting detail that came up: names, relationships, dates, places, events, plans, preferences, shared history, things you asked me to remember, and corrections about who I am or how I speak. Do not stop at a handful; if the conversation was rich, return many. Each fact must be one sentence under 200 characters, written from the Persona\'s point of view (e.g. "Your name is Anna, and I used to call you \'pet\'."). Exclude only pure small talk and fleeting moods, and anything already obvious about me.',
        ].join("\n"),
      },
      { role: "user", content: transcript },
    ],
  });

  let summary = "";
  let facts: string[] = [];
  let title: string | null = null;
  try {
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
      summary?: unknown;
      facts?: unknown;
      title?: unknown;
    };
    summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    title = normaliseTitle(typeof parsed.title === "string" ? parsed.title : null);
    facts = Array.isArray(parsed.facts)
      ? parsed.facts
          .filter((f): f is string => typeof f === "string")
          .map((f) => f.trim())
          .filter((f) => f.length > 0 && f.length <= 300)
          .slice(0, 20)
      : [];
  } catch {
    // Malformed model output — nothing to store.
  }
  // Facts are stored even when the summary comes back empty — they are the
  // durable half, and discarding them here silently lost a whole
  // conversation's memories whenever the model returned a blank summary.
  const key = deriveUserKey(user.id);

  if (summary) {
    // Upsert by conversation: the client summarises periodically, on restart,
    // on switching conversations AND on unload — only the newest should
    // survive, and concurrent calls must not create a second row.
    const { data: existing } = await supabase
      .from("session_summaries")
      .select("id")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("session_summaries")
        .update({ summary_enc: encryptField(summary, key) })
        .eq("id", existing.id);
    } else {
      // The summary references the conversation row; on unload the beacon can
      // outrun the debounced conversation save, so guarantee the row exists.
      await supabase
        .from("conversations")
        .upsert(
          { id: conversationId, user_id: user.id, subject_id: body.subjectId ?? null },
          { onConflict: "id", ignoreDuplicates: true },
        );

      await supabase.from("session_summaries").insert({
        user_id: user.id,
        subject_id: body.subjectId ?? null,
        conversation_id: conversationId,
        summary_enc: encryptField(summary, key),
      });
      // A unique violation here means a concurrent request won the race and
      // already wrote it — not an error worth failing the whole call over,
      // and the facts below must still be stored.
    }
  }

  // Name the conversation from what it was actually about.
  //
  // The fallback title is the opening words of the first thing that was said,
  // so every conversation with the same person came out as a variant of "Hi mum
  // how are you" — a history list where nothing is distinguishable from
  // anything else. A title someone chose themselves is never overwritten: if
  // the stored title is no longer the derived opener, a human renamed it.
  let appliedTitle: string | null = null;
  if (title) {
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("title")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingConv && isAutoTitle(existingConv.title as string | null, body.turns)) {
      const { error } = await supabase
        .from("conversations")
        .update({ title })
        .eq("id", conversationId)
        .eq("user_id", user.id);
      if (!error) appliedTitle = title;
    }
  }

  // Store durable facts on EVERY summarise (not just the first), de-duped
  // against what this person already remembers. The client re-summarises as a
  // conversation grows and on leaving, so this is how anything said later in a
  // long conversation still becomes a lasting memory instead of being lost.
  let added = 0;
  if (facts.length && body.subjectId) {
    const { data: existingMems } = await supabase
      .from("memories")
      .select("content_enc")
      .eq("user_id", user.id)
      .eq("subject_id", body.subjectId)
      .eq("memory_type", "conversation")
      .is("deleted_at", null);

    const seen = new Set(
      (existingMems ?? [])
        .map((row) => {
          try { return decryptField(row.content_enc as string, key).trim().toLowerCase(); } catch { return ""; }
        })
        .filter(Boolean),
    );

    const fresh = facts.filter((f) => !seen.has(f.trim().toLowerCase()));
    if (fresh.length) {
      const now = new Date().toISOString();
      await supabase.from("memories").insert(
        fresh.map((content) => ({
          user_id: user.id,
          subject_id: body.subjectId,
          content_enc: encryptField(content, key),
          // Auto-extracted from the conversation — kept for the persona's
          // continuity but hidden from the memory display.
          memory_type: "conversation",
          created_at: now,
          updated_at: now,
        })),
      );
      added = fresh.length;
    }
  }

  return NextResponse.json({ ok: true, facts: added, title: appliedTitle });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  void params;
  // Returns the recent session summaries for the subject in the query param
  const url = new URL(_request.url);
  const subjectId = url.searchParams.get("subjectId");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ summaries: [] });

  let query = supabase
    .from("session_summaries")
    .select("summary_enc, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(4);

  if (subjectId) query = query.eq("subject_id", subjectId);

  const { data } = await query;
  const key = deriveUserKey(user.id);

  const summaries = (data ?? []).map((row) => ({
    summary: (() => {
      try { return decryptField(row.summary_enc as string, key); } catch { return ""; }
    })(),
    createdAt: row.created_at as string,
  }));

  return NextResponse.json({ summaries });
}
