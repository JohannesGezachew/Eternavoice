import { TalkGate } from "@/components/people/TalkGate";
import { DbHydrator } from "@/components/shell/DbHydrator";

export const metadata = {
  title: "Conversation · EternaVoice",
};

export default async function TalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="relative flex flex-1 flex-col">
      <DbHydrator />
      <TalkGate subjectId={id} />
    </main>
  );
}
