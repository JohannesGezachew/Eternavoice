import { redirect } from "next/navigation";

// Conversation history is per-person and lives on the person's page now.
export default function ConversationsPage() {
  redirect("/people");
}
