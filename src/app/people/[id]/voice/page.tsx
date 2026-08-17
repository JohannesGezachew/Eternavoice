import { AppShell } from "@/components/shell/AppShell";
import { ReRecordVoice } from "@/components/people/ReRecordVoice";

export const metadata = {
  title: "Their voice",
};

export default async function VoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    // Back goes to the person, not the people list: this screen is only ever
    // reached from their page, and returning anywhere else would lose them.
    <AppShell title="Their voice" backHref={`/people/${id}`} showTabs={false}>
      <ReRecordVoice subjectId={id} />
    </AppShell>
  );
}
