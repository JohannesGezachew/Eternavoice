-- Make the persona forget conversations the user already deleted.
--
-- deleteConversationDb only ever set conversations.deleted_at. The rolling
-- summary of that conversation stayed in session_summaries, and the chat route
-- reads the four most recent summaries for a person and hands them to the
-- persona as previous sessions. So every conversation deleted before this ran
-- is still being remembered out loud, by name, in the voice of someone who
-- died — which is the exact thing the user pressed Delete to prevent.
--
-- The code now removes the summary and the conversation outright. This clears
-- what the old behaviour left behind.

-- Summaries belonging to conversations that were soft-deleted.
delete from public.session_summaries s
using public.conversations c
where s.conversation_id = c.id
  and c.deleted_at is not null;

-- Then the conversations themselves, and their turns by cascade. These rows
-- were already invisible to every read path in the app — getConversations, the
-- reader and the export all filter deleted_at — so nothing referenced them and
-- nothing surfaced them. They were only ever storage, and a copy of a
-- transcript the user was told had been permanently removed.
delete from public.conversations
where deleted_at is not null;
