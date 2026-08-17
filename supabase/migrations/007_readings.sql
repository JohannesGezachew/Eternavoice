-- Readings: something you wrote, in their voice.
--
-- Only the text is kept, encrypted like every other free-text column. The
-- audio is not stored — it is regenerated on demand, the same way a saved
-- reply is re-spoken from its text. Audio is expensive to keep and cheap to
-- remake; the words are the irreplaceable part.
--
-- Someone may spend an hour writing a letter to read in their mother's voice.
-- Losing that to a closed tab would be unforgivable, which is the whole reason
-- this table exists rather than the feature being ephemeral.

create table if not exists readings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  title text not null default 'Untitled reading',
  content_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table readings enable row level security;

create policy "Users can manage their own readings"
  on readings for all
  using (auth.uid() = user_id);

create index if not exists idx_readings_user_subject
  on readings (user_id, subject_id, updated_at desc)
  where deleted_at is null;
