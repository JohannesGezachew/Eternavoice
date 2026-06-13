import { NewPersonWizard } from "@/components/people/NewPersonWizard";

export const metadata = {
  title: "New person · EternaVoice",
};

// The wizard renders its own AppShell so the back arrow can step back
// through the flow instead of always leaving it.
export default function NewPersonPage() {
  return <NewPersonWizard />;
}
