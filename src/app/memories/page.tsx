import { redirect } from "next/navigation";

// Memories are per-person and live on the person's own page now.
export default function MemoriesPage() {
  redirect("/people");
}
