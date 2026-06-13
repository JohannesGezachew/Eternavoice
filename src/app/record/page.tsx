import { redirect } from "next/navigation";

// Recording now lives inside the guided creation flow.
export default function RecordPage() {
  redirect("/people/new");
}
