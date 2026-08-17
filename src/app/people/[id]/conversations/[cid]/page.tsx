import { ConversationReader } from "@/components/conversation/ConversationReader";

export const metadata = {
  title: "Reading",
};

// No DbHydrator here: ConversationReader renders AppShell in every branch, and
// AppShell already mounts one. Both instances ran, so opening a saved
// conversation fetched the entire user payload twice.
export default async function ConversationReadPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params;
  return <ConversationReader subjectId={id} conversationId={cid} />;
}
