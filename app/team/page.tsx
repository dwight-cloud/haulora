import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/auth";
import { listDriversForAccount, listInvitesForAccount } from "@/lib/db";
import { TeamClient } from "./TeamClient";

export default async function TeamPage() {
  const s = await getSession();
  if (!s || s.role !== "dispatcher") return null; // middleware also guards
  const drivers = listDriversForAccount(s.accountId).map((d) => ({
    id: d.id, name: d.name, email: d.email, createdAt: d.created_at,
  }));
  const invites = listInvitesForAccount(s.accountId).map((i) => ({
    code: i.code, role: i.role, expiresAt: i.expires_at, usedBy: i.used_by, usedAt: i.used_at,
  }));

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-black">Team</h1>
          <p className="text-ink-500">
            Managing <span className="font-semibold">{s.accountName}</span> — {drivers.length} driver{drivers.length === 1 ? "" : "s"}.
          </p>
        </div>
        <TeamClient initialDrivers={drivers} initialInvites={invites} />
      </main>
    </>
  );
}
