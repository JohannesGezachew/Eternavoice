import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSubjects } from "@/lib/db/subjects";
import { getMemories } from "@/lib/db/memories";
import { getConversations } from "@/lib/db/conversations";
import { getReadings } from "@/lib/db/readings";

export const dynamic = "force-dynamic";

/**
 * Everything this account holds, in one file.
 *
 * There was no such route. The only thing resembling an export was
 * `/api/user/data` — the feed the app uses to populate its own screens, which
 * omits readings entirely and says nothing about the profile or the account.
 * Offering that as someone's data would have quietly left out a whole category
 * of what they wrote.
 *
 * Kept separate from that feed on purpose. Seven screens call it on load, and
 * making every one of them decrypt and ship every reading a person has ever
 * written would be a real cost paid on every page for the sake of one button.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [subjects, memories, conversations, readings, profileResult] =
      await Promise.all([
        getSubjects(),
        getMemories(),
        getConversations(),
        getReadings(),
        supabase
          .from("profiles")
          .select("display_name, created_at, subscription_status, trial_ends_at")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

    const profile = profileResult.data as Record<string, unknown> | null;

    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        account: {
          email: user.email ?? null,
          ...(profile ?? {}),
        },
        // Conversations carry their turns; readings carry their scripts. Both
        // are decrypted here, which is the point of an export — it is the one
        // place the plaintext is meant to leave the system.
        people: subjects,
        memories,
        conversations,
        readings,
      },
      {
        headers: {
          "Content-Disposition": 'attachment; filename="eternavoice-export.json"',
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build the export";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
