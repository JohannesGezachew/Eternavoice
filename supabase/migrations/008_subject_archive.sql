-- Put someone away without erasing them.
--
-- Until now the only way off the people page was permanent deletion: the voice
-- gone at the provider, every conversation and memory with it. That is the
-- wrong and only option for the person who cannot bear to see their mother's
-- card on every visit but would never, ever delete her. Archiving is the
-- reversible middle: hidden from the shelf, everything kept.
--
-- Separate from deleted_at on purpose. deleted_at means "treat as gone" — the
-- subject queries filter it out, the delete flow destroys the hosted voice
-- first, and nothing brings it back. archived_at only changes what the library
-- lists, so an archived person is still fully loadable, still owns their voice,
-- and unarchiving is a single write.

alter table subjects
  add column if not exists archived_at timestamptz;

-- Unlike profiles in 004, subjects still carries the default UPDATE grant for
-- `authenticated`, so no grant is needed here. If that grant is ever narrowed
-- to a column list (the fix for the voice_id escalation path), archived_at must
-- be in it alongside name/relationship/persona — otherwise archiving fails
-- silently in the browser with a row-count of zero and no error.

-- The people page reads every non-deleted subject and splits it on this column,
-- so the existing per-user ordering index is what actually gets used; this
-- partial index keeps the archived split cheap once someone has a shelf-full.
create index if not exists idx_subjects_user_archived
  on subjects (user_id, archived_at)
  where deleted_at is null;
