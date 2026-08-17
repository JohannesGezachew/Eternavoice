import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  relationship: z.string().max(120).optional(),
  persona: z.record(z.string(), z.unknown()).optional(),
  /** Archive / unarchive. A boolean rather than a timestamp so the client can
   *  never backdate the archive, and so "unarchive" is unambiguous. */
  archived: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // The table's own Update type, so a column that does not exist — or one this
  // route must never write, like voice_id — fails to compile instead of being
  // quietly dropped by PostgREST.
  const updates: Database["public"]["Tables"]["subjects"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.relationship !== undefined) updates.relationship = body.relationship;
  if (body.persona !== undefined) updates.persona = body.persona as unknown as Json;
  if (body.archived !== undefined) {
    updates.archived_at = body.archived ? new Date().toISOString() : null;
  }

  const { error } = await supabase
    .from("subjects")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("subjects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
