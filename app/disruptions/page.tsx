import { Nav } from "@/components/Nav";
import { DisruptionsClient } from "./DisruptionsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disruptions — Haulio" };

export default function DisruptionsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <DisruptionsClient apiKey={process.env.NEXT_PUBLIC_HERE_API_KEY ?? ""} />
      </main>
    </>
  );
}
