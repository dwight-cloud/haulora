import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/auth";
import { listAssignmentsForDriver } from "@/lib/assignments";
import { DriverAssignmentCard } from "./DriverAssignmentCard";

export default async function DriverPage() {
  const session = await getSession();
  const runs = session ? listAssignmentsForDriver(session.sub) : [];
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-3xl font-black">Today</h1>
        <p className="text-ink-500">Welcome, {session?.name}.</p>

        <div className="mt-8 space-y-4">
          {runs.length === 0 && (
            <div className="rounded-xl border border-dashed border-ink-300 p-10 text-center text-sm text-ink-500">
              No runs assigned. Dispatch will push routes here.
            </div>
          )}
          {runs.map((a) => (
            <DriverAssignmentCard key={a.id} assignment={a} />
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">
          Messaging with dispatch — coming in v2.
        </div>
      </main>
    </>
  );
}
