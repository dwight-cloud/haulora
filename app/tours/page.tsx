import { Nav } from "@/components/Nav";
import { TourPlanner } from "./TourPlanner";
import { PageHeader } from "@/components/ui/primitives";

export default function ToursPage() {
  const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY ?? "";
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="HERE ops"
          title="Tour planner"
          subtitle="Configure a fleet (count, capacity, shift window, depot) plus jobs — HERE's VRP solver assigns each job to the best vehicle and orders the stops."
        />
        <TourPlanner apiKey={apiKey} />
      </main>
    </>
  );
}
