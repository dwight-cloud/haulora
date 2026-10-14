import { Nav } from "@/components/Nav";
import { MultiStopSequencer } from "./Sequencer";
import { PageHeader } from "@/components/ui/primitives";

export default function SequencePage() {
  const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY ?? "";
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="HERE ops"
          title="Multi-stop sequencer"
          subtitle="Drop in a pickup, N stops, and an optional final destination. HERE finds the optimal visit order for a truck."
        />
        <MultiStopSequencer apiKey={apiKey} />
      </main>
    </>
  );
}
