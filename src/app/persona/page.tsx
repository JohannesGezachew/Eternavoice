import { Nav } from "@/components/shell/Nav";
import { PersonaSetup } from "@/components/persona/PersonaSetup";

export const metadata = {
  title: "Who · EternaVoice",
};

export default function PersonaPage() {
  return (
    <>
      <Nav />
      <main className="relative flex flex-1 flex-col">
        <PersonaSetup />
      </main>
    </>
  );
}
