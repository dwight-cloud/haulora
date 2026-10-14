"use client";

import { useState } from "react";

interface Driver { id: string; name: string; email: string; createdAt: number }
interface Invite { code: string; role: "dispatcher" | "driver"; expiresAt: number; usedBy: string | null; usedAt: number | null }

export function TeamClient({ initialDrivers, initialInvites }: { initialDrivers: Driver[]; initialInvites: Invite[] }) {
  const [drivers] = useState<Driver[]>(initialDrivers);
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [role, setRole] = useState<"driver" | "dispatcher">("driver");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createInvite() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setInvites([{ code: data.invite.code, role: data.invite.role, expiresAt: data.invite.expiresAt, usedBy: null, usedAt: null }, ...invites]);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function revoke(code: string) {
    const res = await fetch("/api/team/invites", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) setInvites(invites.filter((i) => i.code !== code));
  }

  const pending = invites.filter((i) => !i.usedBy);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-bold">Drivers</h2>
        <p className="text-sm text-ink-500">Only your fleet's drivers. Sharing is not allowed across accounts.</p>
        <div className="mt-4 divide-y divide-ink-200">
          {drivers.length === 0 && <div className="py-4 text-sm text-ink-500">No drivers yet. Invite one →</div>}
          {drivers.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-semibold">{d.name}</div>
                <div className="text-xs text-ink-500">{d.email}</div>
              </div>
              <span className="rounded bg-ink-50 px-2 py-0.5 text-xs">driver</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-bold">Invite teammates</h2>
        <p className="text-sm text-ink-500">Invite codes are valid for 7 days. Share by text, email, or Slack.</p>

        <div className="mt-4 flex items-end gap-2">
          <label className="block flex-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "driver" | "dispatcher")}
              className="mt-1 w-full rounded border border-ink-300 bg-white px-3 py-2"
            >
              <option value="driver">Driver</option>
              <option value="dispatcher">Dispatcher</option>
            </select>
          </label>
          <button
            onClick={createInvite}
            disabled={busy}
            className="rounded bg-ink-900 px-4 py-2 font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            Generate invite
          </button>
        </div>
        {error && <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}

        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Pending invites</div>
          <div className="mt-2 divide-y divide-ink-200">
            {pending.length === 0 && <div className="py-3 text-sm text-ink-500">None.</div>}
            {pending.map((i) => (
              <div key={i.code} className="flex items-center justify-between py-2">
                <div>
                  <code className="rounded bg-ink-50 px-2 py-0.5 font-mono text-sm">{i.code}</code>
                  <span className="ml-2 text-xs text-ink-500">{i.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(i.code)}
                    className="text-xs text-ink-500 hover:text-ink-900"
                  >Copy</button>
                  <button
                    onClick={() => revoke(i.code)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
