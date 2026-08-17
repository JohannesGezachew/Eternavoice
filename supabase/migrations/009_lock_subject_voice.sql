-- Close the cross-tenant voice path at the database, not just in the code.
--
-- src/lib/db/subjects.ts explains at length why voice_id must never be
-- caller-writable: assertVoiceOwner decides access by asking "does a subject I
-- own carry this voice_id?", so being able to write that column means pointing
-- your own row at someone else's cloned voice. The server action is careful
-- never to expose it.
--
-- But that reasoning lived only in the application. The RLS policy here is
-- row-scoped, not column-scoped —
--
--   create policy "Users can manage their own subjects"
--     on subjects for all using (auth.uid() = user_id);
--
-- — and Supabase's default grants give `authenticated` UPDATE on every column.
-- So the server action could be bypassed entirely by talking to PostgREST:
--
--   PATCH /rest/v1/subjects?id=eq.<a row I own>
--   { "voice_id": "<a voice belonging to someone else>" }
--
-- RLS passes: it is the caller's own row. assertVoiceOwner then answers yes,
-- and /api/chat, /api/tts and /api/voice-preview will all speak in a stranger's
-- dead relative's voice — while DELETE /api/voices/[voiceId] will destroy it.
-- Exploiting it needs the victim's provider voice id, which is not guessable,
-- but that is obscurity rather than a control, and the id is shipped to the
-- browser of everyone who owns it.
--
-- This is the same hole migration 004 closed for profiles, on the table where
-- it is worse. Same remedy: revoke the blanket grant and re-grant only the
-- columns a person legitimately edits about someone they are remembering.
--
-- voice_id and voice_name are deliberately absent. They are written by the
-- clone route under the service role, from a voice that request just created —
-- never from anything the client sent.

revoke update on public.subjects from anon, authenticated;

-- INSERT is a separate grant, and closing only UPDATE would leave the identical
-- hole one step to the left: create a NEW row of your own already carrying
-- someone else's voice_id, and assertVoiceOwner answers yes just the same.
revoke insert on public.subjects from anon, authenticated;

grant insert (
  user_id,
  name,
  relationship,
  persona
) on public.subjects to authenticated;

grant update (
  name,
  relationship,
  persona,
  corpus_quality_score,
  archived_at,
  deleted_at,
  updated_at
) on public.subjects to authenticated;

-- Row scoping still applies to the remaining rights, and WITH CHECK stops a row
-- being moved to another owner. The original policy declared only USING, which
-- Postgres mirrors into WITH CHECK for FOR ALL — stated explicitly here so the
-- guarantee survives anyone editing it later.
drop policy if exists "Users can manage their own subjects" on public.subjects;

create policy "Users can manage their own subjects"
  on public.subjects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
