import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deriveUserKey, encryptField, decryptField } from "@/lib/crypto";
import { openai } from "@/lib/openai";
import { env } from "@/lib/env";

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
    .max(40),
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

  const transcript = body.turns
    .map((t) => `${t.role === "user" ? "User" : "Persona"}: ${t.content}`)
    .join("\n");

  // One call, two artifacts: the session summary (continuity between
  // conversations) and durable facts (memories the persona carries forever).
  const response = await openai().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 700,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are a memory assistant for a voice-companion app. Given a conversation transcript between a user and a persona (a recreated voice of someone the user knows), return JSON with exactly two keys:",
          '- "summary": a concise 3-5 sentence third-person summary covering what was discussed, the emotional tone, and anything worth following up on next time. Specific, never generic.',
          '- "facts": an array of 0-8 short, durable, declarative facts worth remembering across all future conversations — names, relationships, dates, places, shared history, things the user asked the persona to remember, corrections about who the persona is or how they speak. Each fact must be one sentence under 200 characters, stated plainly (e.g. "The user\'s name is Anna; the persona called her \'pet\'."). Exclude small talk, one-off moods, and anything already obvious from the persona itself.',
        ].join("\n"),
      },
      { role: "user", content: transcript },
    ],
  });

  let summary = "";
  let facts: string[] = [];
  try {
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
      summary?: unknown;
      facts?: unknown;
    };
    summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    facts = Array.isArray(parsed.facts)
      ? parsed.facts
          .filter((f): f is string => typeof f === "string")
          .map((f) => f.trim())
          .filter((f) => f.length > 0 && f.length <= 300)
          .slice(0, 8)
      : [];
  } catch {
    // Malformed model output — nothing to store.
  }
  if (!summary) return NextResponse.json({ ok: true });

  const key = deriveUserKey(user.id);

  // Upsert by conversation: the client summarises on restart, on switching
  // conversations, AND on unload — only the newest version should survive.
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

    const { error: insertErr } = await supabase.from("session_summaries").insert({
      user_id: user.id,
      subject_id: body.subjectId ?? null,
      conversation_id: conversationId,
      summary_enc: encryptField(summary, key),
    });
    if (insertErr) {
      // Without a stored summary the fact guard below would re-fire on the
      // next call — bail out rather than risk duplicate memories.
      return NextResponse.json({ error: "Could not store summary" }, { status: 500 });
    }

    // Facts are written once per conversation (on its first summarise) so
    // re-summarising never duplicates memories.
    if (facts.length && body.subjectId) {
      const now = new Date().toISOString();
      await supabase.from("memories").insert(
        facts.map((content) => ({
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
    }
  }

  return NextResponse.json({ ok: true, facts: facts.length });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  void params;
  // Returns the last 2 session summaries for the subject in the query param
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
    .limit(2);

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
