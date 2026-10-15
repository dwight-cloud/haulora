import { Nav } from "@/components/Nav";
import { LoadsClient } from "./LoadsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Loads — Haulio" };

export default function LoadsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <LoadsClient apiKey={process.env.NEXT_PUBLIC_HERE_API_KEY ?? ""} />
      </main>
    </>
  );
}
