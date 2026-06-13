import { redirect } from "next/navigation";

// Personas are edited on the person's own page now.
export default function PersonaPage() {
  redirect("/people");
}
