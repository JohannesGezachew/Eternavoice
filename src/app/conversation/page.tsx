import { ConversationExperience } from "@/components/conversation/ConversationExperience";

export const metadata = {
  title: "Conversation · EternaVoice",
};

export default function ConversationPage() {
  return (
    <main className="relative flex flex-1 flex-col">
      <ConversationExperience />
    </main>
  );
}
