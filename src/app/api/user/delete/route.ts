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

/**
 * Erase an account, and only say so if it happened.
 *
 * Every step here used to run unchecked. A failed delete on any table was
 * indistinguishable from a successful one, the auth user was removed anyway,
 * and the response said `{ deleted: true }` — so a person exercising their
 * right to erasure was told their data was gone while it sat in Postgres,
 * now with no account left that could ever reach it again to try a second
 * time.
 *
 * The order matters and is deliberate: everything else first, the auth user
 * last. Anything that fails before that point leaves the account intact and
 * the request retryable, which is the only recoverable outcome available.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    Body.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send { confirm: 'DELETE MY ACCOUNT' } to proceed." },
      { status: 400 },
    );
  }

  const admin = adminSupabase();

  // 1. The cloned voices, at ElevenLabs.
  //
  // A failure here used to be swallowed entirely, which meant "delete my
  // account" could leave a clone of a dead person's voice sitting on a third
  // party's servers indefinitely, with the account that knew about it erased a
  // moment later. It is now a hard stop: nothing local is touched until the
  // voices are gone, because once the subjects rows go there is no record of
  // which voices to chase.
  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("voice_id")
    .eq("user_id", user.id)
    .not("voice_id", "is", null);

  if (subjectsError) {
    return NextResponse.json(
      { error: "We couldn't reach your account. Nothing was deleted — please try again." },
      { status: 500 },
    );
  }

  const voiceIds = (subjects ?? [])
    .map((s) => s.voice_id as string | null)
    .filter((id): id is string => Boolean(id));

  if (voiceIds.length) {
    const client = elevenlabs();
    const results = await Promise.allSettled(
      voiceIds.map((id) => client.voices.delete(id)),
    );
    const stranded = results.filter((r) => r.status === "rejected").length;
    if (stranded > 0) {
      console.error("[account-delete] voice deletion failed", {
        userId: user.id,
        stranded,
      });
      return NextResponse.json(
        {
          error:
            "We couldn't remove the voice recordings from our speech provider, so nothing has been deleted yet. Please try again in a few minutes — if it keeps failing, contact us and we'll finish it by hand.",
        },
        { status: 502 },
      );
    }
  }

  // 2. Stripe. A failure here is logged but not fatal: the subscription is
  //    billing state at a third party, and blocking erasure on it would leave
  //    the user unable to delete anything at all.
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  const subscriptionId = (profile as { subscription_id: string | null } | null)
    ?.subscription_id;
  if (subscriptionId) {
    try {
      await stripe().subscriptions.cancel(subscriptionId);
    } catch (err) {
      console.error("[account-delete] stripe cancel failed", user.id, err);
    }
  }

  // 3. The data itself.
  //
  // profiles cascades to every one of these, but they are stated explicitly so
  // a failure is visible per table rather than hidden inside one cascade — and
  // so that adding a table without a cascade cannot silently start leaving
  // data behind. readings and usage_counters were missing from this list
  // entirely; both cascade, so both were in fact removed, but nothing here
  // would have said otherwise if they had not.
  for (const table of [
    "session_summaries",
    "readings",
    "memories",
    "turns",
    "conversations",
    "subjects",
    "usage_counters",
  ] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", user.id);
    if (error) {
      console.error(`[account-delete] ${table} delete failed`, user.id, error);
      return NextResponse.json(
        {
          error:
            "Something went wrong partway through. Your account still exists — please try again, and nothing will be lost if it fails again.",
        },
        { status: 500 },
      );
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .delete()
    .eq("id", user.id);
  if (profileError) {
    console.error("[account-delete] profile delete failed", user.id, profileError);
    return NextResponse.json(
      {
        error:
          "Something went wrong partway through. Your account still exists — please try again.",
      },
      { status: 500 },
    );
  }

  // 4. The login, last of all.
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    // Everything they made is already gone; only the empty login remains, and
    // saying "try again" about a sign-in they can no longer use would be
    // nonsense. Logged loudly so it can be cleared up on our side.
    console.error("[account-delete] auth user delete failed", user.id, authError);
    return NextResponse.json({
      deleted: true,
      note: "Your data has been deleted. Your sign-in is still being removed.",
    });
  }

  return NextResponse.json({ deleted: true });
}
