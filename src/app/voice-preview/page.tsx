import { redirect } from "next/navigation";

// The preview is the Listen step of the creation flow.
export default function VoicePreviewPage() {
  redirect("/people/new");
}
