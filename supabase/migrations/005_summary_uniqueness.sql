-- One summary per conversation.
--
-- The client summarises periodically (every ~8 turns), on restart, on
-- switching conversations, on pagehide AND on visibilitychange — so two
-- identical requests landing milliseconds apart is routine, not exceptional.
-- Both would read "no existing summary" and both would insert, leaving two
-- rows for one conversation. The update path only ever touches one of them,
-- so the stale duplicate then survives forever and burns a slot in the
-- "recent sessions" context window.
--
-- De-duplicate first (keep the newest), then let the database enforce it.

delete from public.session_summaries s
where exists (
  select 1 from public.session_summaries newer
  where newer.user_id = s.user_id
    and newer.conversation_id = s.conversation_id
    and (newer.created_at, newer.id) > (s.created_at, s.id)
);

create unique index if not exists session_summaries_one_per_conversation
  on public.session_summaries (user_id, conversation_id);
