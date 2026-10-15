import { Nav } from "@/components/Nav";
import { AgentsClient } from "./AgentsClient";

export const dynamic = "force-dynamic";

export default function AgentsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <AgentsClient />
      </main>
    </>
  );
}
