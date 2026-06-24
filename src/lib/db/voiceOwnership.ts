import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Verify an ElevenLabs voiceId belongs to one of the current user's
 * (non-deleted) subjects.
 *
 * Every cloned voice lives under the app's single ElevenLabs account, so the
 * voiceId is not namespaced per user at the provider. Without this check, any
 * authenticated user who learned another user's voiceId could synthesize
 * speech in — or delete — someone else's cloned voice. Every route that takes
 * a voiceId from the client must gate on this.
 */
export async function assertVoiceOwner(
  voiceId: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data, error } = await supabase
    .from("subjects")
    .select("id")
    .eq("user_id", user.id)
    .eq("voice_id", voiceId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error || !data) return { ok: false, status: 403 };
  return { ok: true, userId: user.id };
}
