import { Nav } from "@/components/Nav";
import { FleetClient } from "./FleetClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trucks — Haulora" };

export default function FleetPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <FleetClient apiKey={process.env.NEXT_PUBLIC_HERE_API_KEY ?? ""} />
      </main>
    </>
  );
}
