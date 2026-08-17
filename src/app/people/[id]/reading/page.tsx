import { ReadingRoom } from "@/components/reading/ReadingRoom";
import { DbHydrator } from "@/components/shell/DbHydrator";

export const metadata = {
  title: "A reading",
};

export default async function ReadingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <DbHydrator />
      <ReadingRoom subjectId={id} />
    </>
  );
}
