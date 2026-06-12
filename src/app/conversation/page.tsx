import { redirect } from "next/navigation";

// The talk screen now lives under the person it belongs to.
export default function ConversationPage() {
  redirect("/people/current/talk");
}
