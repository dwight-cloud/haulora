import { Nav } from "@/components/Nav";
import { EvalsClient } from "./EvalsClient";

export const dynamic = "force-dynamic";

export default function EvalsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <EvalsClient />
      </main>
    </>
  );
}
