import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/auth";
import { listDriversForAccount } from "@/lib/db";
import { listThreadsForAccount } from "@/lib/messages";
import { MessagesPanel } from "./MessagesPanel";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const s = await getSession();
  if (!s || s.role !== "dispatcher") return null;
  const drivers = listDriversForAccount(s.accountId).map((d) => ({ id: d.id, name: d.name, email: d.email }));
  const threads = listThreadsForAccount(s.accountId);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-3xl font-black">Messages</h1>
        <p className="text-ink-500">Talk to drivers in the field — they see it on their phone.</p>
        <MessagesPanel drivers={drivers} initialThreads={threads} />
      </main>
    </>
  );
}
