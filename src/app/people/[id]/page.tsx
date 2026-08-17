import { AppShell } from "@/components/shell/AppShell";
import { PersonHub } from "@/components/people/PersonHub";

export const metadata = {
  title: "Person",
};

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell backHref="/people">
      <PersonHub subjectId={id} />
    </AppShell>
  );
}
