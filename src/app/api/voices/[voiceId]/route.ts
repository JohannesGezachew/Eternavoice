import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs } from "@/lib/elevenlabs";
import { checkRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Params = z.object({
  voiceId: z.string().min(8).max(64),
});

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ voiceId: string }> },
) {
  const limit = await checkRate({
    scope: "voice-delete",
    windowMs: 60 * 60 * 1000,
    max: 20,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many voice delete attempts. Try again later." },
      { status: 429 },
    );
  }

  const parsed = Params.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid voice id." }, { status: 400 });
  }

  try {
    await elevenlabs().voices.delete(parsed.data.voiceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not delete that provider voice.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
