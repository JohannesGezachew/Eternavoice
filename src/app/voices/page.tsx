import { redirect } from "next/navigation";

// Voices became People — one place per person for voice, persona,
// memories, and conversations.
export default function VoicesPage() {
  redirect("/people");
}
