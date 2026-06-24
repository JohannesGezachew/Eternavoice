import { NextResponse } from "next/server";
import { z } from "zod";
import { elevenlabs } from "@/lib/elevenlabs";
import { checkRate } from "@/lib/rateLimit";
import { assertVoiceOwner } from "@/lib/db/voiceOwnership";

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

  // Only the owner may delete their cloned voice from the provider.
  const owner = await assertVoiceOwner(parsed.data.voiceId);
  if (!owner.ok) {
    return NextResponse.json(
      { error: owner.status === 401 ? "Unauthorized" : "That voice isn't yours." },
      { status: owner.status },
    );
  }

  try {
    await elevenlabs().voices.delete(parsed.data.voiceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[voice-delete] provider failed:", err);
    return NextResponse.json(
      { error: "Could not delete that hosted voice." },
      { status: 502 },
    );
  }
}
