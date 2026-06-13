import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { elevenlabs } from "@/lib/elevenlabs";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const Body = z.object({
  confirm: z.literal("DELETE MY ACCOUNT"),
});

function stripe() {
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-05-27.dahlia" });
}

function adminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send { confirm: 'DELETE MY ACCOUNT' } to proceed." }, { status: 400 });
  }

  void parsed; // confirmation validated

  const admin = adminSupabase();

  // 1. Delete all ElevenLabs voices for this user
  const { data: subjects } = await supabase
    .from("subjects")
    .select("voice_id")
    .eq("user_id", user.id)
    .not("voice_id", "is", null);

  if (subjects?.length) {
    const client = elevenlabs();
    await Promise.allSettled(
      subjects.map((s) =>
        client.voices.delete(s.voice_id as string).catch(() => null),
      ),
    );
  }

  // 2. Cancel Stripe subscription
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, subscription_id")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_id) {
    await stripe().subscriptions.cancel(profile.subscription_id as string).catch(() => null);
  }

  // 3. Delete all DB data (cascades handle most via FK)
  // Hard-delete turns, memories, session_summaries, conversations, subjects, profiles
  await admin.from("session_summaries").delete().eq("user_id", user.id);
  await admin.from("memories").delete().eq("user_id", user.id);
  await admin.from("turns").delete().eq("user_id", user.id);
  await admin.from("conversations").delete().eq("user_id", user.id);
  await admin.from("subjects").delete().eq("user_id", user.id);
  await admin.from("profiles").delete().eq("id", user.id);

  // 4. Delete Supabase auth user (must be last)
  await admin.auth.admin.deleteUser(user.id);

  return NextResponse.json({ deleted: true });
}
