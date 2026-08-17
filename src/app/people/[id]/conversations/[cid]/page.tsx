import { ConversationReader } from "@/components/conversation/ConversationReader";
import { DbHydrator } from "@/components/shell/DbHydrator";

export const metadata = {
  title: "Reading",
};

export default async function ConversationReadPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params;
  return (
    <>
      <DbHydrator />
      <ConversationReader subjectId={id} conversationId={cid} />
    </>
  );
}
