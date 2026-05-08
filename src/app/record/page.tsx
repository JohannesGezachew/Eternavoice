import { Nav } from "@/components/shell/Nav";
import { RecordExperience } from "@/components/recording/RecordExperience";

export const metadata = {
  title: "Record · EternaVoice",
};

export default function RecordPage() {
  return (
    <>
      <Nav />
      <main className="relative flex flex-1 flex-col">
        <RecordExperience />
      </main>
    </>
  );
}
