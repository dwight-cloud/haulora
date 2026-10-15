import { Nav } from "@/components/Nav";
import { ApprovalsClient } from "@/app/approvals/ApprovalsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decisions — Haulio" };

export default function DecisionsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <ApprovalsClient />
      </main>
    </>
  );
}
