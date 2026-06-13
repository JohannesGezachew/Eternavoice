import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSubjects } from "@/lib/db/subjects";
import { getMemories } from "@/lib/db/memories";
import { getConversations } from "@/lib/db/conversations";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [subjects, memories, conversations] = await Promise.all([
      getSubjects(),
      getMemories(),
      getConversations(),
    ]);

    return NextResponse.json({ subjects, memories, conversations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load user data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
