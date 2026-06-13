-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  stripe_customer_id text,
  subscription_status text not null default 'inactive',
  subscription_id text,
  data_key_enc text,               -- AES-256 per-user data key, encrypted with master key
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table profiles enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─────────────────────────────────────────────
-- subjects  (previously "voices" in localStorage)
-- ─────────────────────────────────────────────
create table if not exists subjects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  relationship text,
  voice_id text,
  voice_name text,
  persona jsonb not null default '{}',
  corpus_quality_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table subjects enable row level security;

create policy "Users can manage their own subjects"
  on subjects for all
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────────
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  title text not null default 'New conversation',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table conversations enable row level security;

create policy "Users can manage their own conversations"
  on conversations for all
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- turns
-- ─────────────────────────────────────────────
create table if not exists turns (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content_enc text not null,       -- AES-256-GCM encrypted content
  feedback text,
  created_at timestamptz not null default now()
);

alter table turns enable row level security;

create policy "Users can manage their own turns"
  on turns for all
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- memories
-- ─────────────────────────────────────────────
create table if not exists memories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  content_enc text not null,       -- encrypted
  memory_type text not null default 'general',  -- 'general' | 'user_fact'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table memories enable row level security;

create policy "Users can manage their own memories"
  on memories for all
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- session_summaries
-- ─────────────────────────────────────────────
create table if not exists session_summaries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  summary_enc text not null,       -- encrypted, ~400 tokens
  created_at timestamptz not null default now()
);

alter table session_summaries enable row level security;

create policy "Users can manage their own session summaries"
  on session_summaries for all
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- indexes
-- ─────────────────────────────────────────────
create index if not exists idx_subjects_user_id on subjects(user_id) where deleted_at is null;
create index if not exists idx_conversations_user_id on conversations(user_id) where deleted_at is null;
create index if not exists idx_conversations_subject_id on conversations(subject_id) where deleted_at is null;
create index if not exists idx_turns_conversation_id on turns(conversation_id);
create index if not exists idx_memories_user_subject on memories(user_id, subject_id) where deleted_at is null;
create index if not exists idx_session_summaries_user_subject on session_summaries(user_id, subject_id);
