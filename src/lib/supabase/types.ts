/**
 * The database, as TypeScript sees it.
 *
 * Every query in this app returned `any` — supabase-js is generic over a
 * Database type and nothing supplied one — so roughly fifty `as string` casts
 * grew up around the call sites to make the results usable. Each of those is
 * an assertion the compiler cannot check: `row.voice_id as string` reads
 * identically whether the column exists, is nullable, or was renamed three
 * migrations ago, and it is exactly as convincing in all three cases.
 *
 * Written by hand from supabase/migrations rather than generated, because
 * generation needs project credentials and a network round trip, while the
 * migrations are the same source of truth and are already in the repo. The
 * tradeoff is that this file has to be updated alongside a migration — which
 * is stated at the top of each table so it is hard to miss.
 *
 * Nullability follows the DDL exactly. Columns that are `not null` and have a
 * default are still required on Row (the database always returns them) and
 * optional on Insert (the default fills them in).
 */

/**
 * Deliberately `type`, not `interface`, all the way down.
 *
 * postgrest-js constrains every table to `Record<string, unknown>`, and an
 * interface is not assignable to that — only a type alias gets the implicit
 * index signature. Written as interfaces, the whole schema silently failed the
 * constraint, `Schema` fell back to `never`, and every query in the app
 * resolved to `never` while still compiling. Which is worse than having no
 * types at all: it looks like the types are working.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** 001_initial_schema.sql, 002 (trial_ends_at), 006 (display_name), 012 (subscription_event_at) */
type ProfileRow = {
  id: string;
  stripe_customer_id: string | null;
  subscription_status: string;
  subscription_id: string | null;
  data_key_enc: string | null;
  created_at: string;
  deleted_at: string | null;
  trial_ends_at: string | null;
  display_name: string | null;
  subscription_event_at: string | null;
};

/** 001_initial_schema.sql, 008 (archived_at) */
type SubjectRow = {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  voice_id: string | null;
  voice_name: string | null;
  persona: Json;
  corpus_quality_score: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  archived_at: string | null;
};

/** 001_initial_schema.sql */
type ConversationRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** 001_initial_schema.sql */
type TurnRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content_enc: string;
  feedback: string | null;
  created_at: string;
};

/** 001_initial_schema.sql */
type MemoryRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  content_enc: string;
  memory_type: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** 001_initial_schema.sql */
type SessionSummaryRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  conversation_id: string | null;
  summary_enc: string;
  created_at: string;
};

/** 003_usage_counters.sql */
type UsageCounterRow = {
  user_id: string;
  scope: string;
  period_start: string;
  count: number;
  updated_at: string;
};

/** 007_readings.sql */
type ReadingRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  content_enc: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** 012_stripe_webhook_safety.sql */
type StripeEventRow = {
  id: string;
  type: string;
  received_at: string;
};

/**
 * `Relationships` is required by postgrest-js's GenericTable constraint, and
 * powers typed embedded selects. Only conversations↔turns is declared, because
 * that is the only embedded select in the app; every other join is done in
 * TypeScript after two separate queries.
 *
 * Insert shape: anything with a database default is optional, everything else
 * is required. Update shape: everything optional.
 *
 * These are spelled out per table rather than derived, so that a column which
 * must be supplied on insert cannot quietly become optional by inheriting a
 * mapped type someone loosened elsewhere.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Pick<ProfileRow, "id"> & Partial<ProfileRow>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      subjects: {
        Row: SubjectRow;
        Insert: Pick<SubjectRow, "user_id" | "name"> & Partial<SubjectRow>;
        Update: Partial<SubjectRow>;
        Relationships: [];
      };
      conversations: {
        Row: ConversationRow;
        Insert: Pick<ConversationRow, "user_id"> & Partial<ConversationRow>;
        Update: Partial<ConversationRow>;
        // The join is declared on `turns`, which is where the foreign key
        // actually lives; postgrest derives the reverse embed from it.
        Relationships: [];
      };
      turns: {
        Row: TurnRow;
        Insert: Pick<TurnRow, "conversation_id" | "user_id" | "role" | "content_enc"> &
          Partial<TurnRow>;
        Update: Partial<TurnRow>;
        Relationships: [
          {
            foreignKeyName: "turns_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      memories: {
        Row: MemoryRow;
        Insert: Pick<MemoryRow, "user_id" | "content_enc"> & Partial<MemoryRow>;
        Update: Partial<MemoryRow>;
        Relationships: [];
      };
      session_summaries: {
        Row: SessionSummaryRow;
        Insert: Pick<SessionSummaryRow, "user_id" | "summary_enc"> &
          Partial<SessionSummaryRow>;
        Update: Partial<SessionSummaryRow>;
        Relationships: [];
      };
      usage_counters: {
        Row: UsageCounterRow;
        Insert: Pick<UsageCounterRow, "user_id" | "scope" | "period_start"> &
          Partial<UsageCounterRow>;
        Update: Partial<UsageCounterRow>;
        Relationships: [];
      };
      readings: {
        Row: ReadingRow;
        Insert: Pick<ReadingRow, "user_id" | "content_enc"> & Partial<ReadingRow>;
        Update: Partial<ReadingRow>;
        Relationships: [];
      };
      stripe_events: {
        Row: StripeEventRow;
        Insert: Pick<StripeEventRow, "id" | "type"> & Partial<StripeEventRow>;
        Update: Partial<StripeEventRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
