import { redirect } from "next/navigation";

// Subjects are People — same id, new home.
export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/people/${id}`);
}
