"use client";

import { useEffect, useState } from "react";

interface ConnectionInfo { connected: boolean; sandbox?: boolean; orgName?: string; connectedAt?: number }
interface Vehicle {
  id: string; name: string; driverName: string;
  lat: number; lon: number; speedMph: number; fuelPct: number;
  onDuty: boolean; drivingRemainingHours: number;
}

export function IntegrationsPanel() {
  const [conn, setConn] = useState<ConnectionInfo | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [token, setToken] = useState("");
  const [orgName, setOrgName] = useState("Sandbox Fleet");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadConn() {
    const res = await fetch("/api/samsara/connect");
    if (res.ok) setConn(await res.json());
  }
  async function loadVehicles() {
    const res = await fetch("/api/samsara/vehicles");
    if (res.ok) {
      const d = await res.json();
      if (d.vehicles) setVehicles(d.vehicles);
    }
  }

  useEffect(() => { loadConn().then(loadVehicles); }, []);
  useEffect(() => {
    if (!conn?.connected) return;
    const t = setInterval(loadVehicles, 15_000);
    return () => clearInterval(t);
  }, [conn?.connected]);

  async function connect() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/samsara/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token || "SANDBOX_TOKEN", orgName }),
      });
      if (!res.ok) throw new Error(`connect failed ${res.status}`);
      await loadConn(); await loadVehicles();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "connect error");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setErr(null);
    try {
      await fetch("/api/samsara/connect", { method: "DELETE" });
      setVehicles([]);
      await loadConn();
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Fleet</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Integrations</h1>
        <p className="mt-1 text-ink-500">Connect your ELD provider to pull live locations, HOS, and diagnostics.</p>
      </div>

      {/* Samsara card */}
      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-sm font-bold text-offwhite">S</div>
              <div>
                <div className="text-lg font-bold">Samsara</div>
                <div className="text-xs text-ink-500">ELD · Telematics · HOS</div>
              </div>
            </div>
          </div>
          {conn?.connected ? (
            <span className="rounded-full bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-green-700">
              Connected {conn.sandbox ? "(sandbox)" : ""}
            </span>
          ) : (
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-500">
              Not connected
            </span>
          )}
        </div>

        {err && <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        {!conn?.connected ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink-600">
              Paste your Samsara API token (Cloud → Settings → API Tokens). In sandbox mode the token is
              only used to scope calls — leave it empty and we'll generate mock fleet data you can demo against.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Organization name</span>
                <input className="mt-1 input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">API token (optional in sandbox)</span>
                <input className="mt-1 input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="samsara_api_…" />
              </label>
            </div>
            <button
              disabled={busy}
              onClick={connect}
              className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-offwhite hover:bg-ink-800 disabled:opacity-50"
            >
              {busy ? "Connecting…" : "Connect Samsara"}
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div><b>{conn.orgName}</b></div>
                <div className="text-ink-500">Connected {conn.connectedAt ? new Date(conn.connectedAt).toLocaleString() : "—"}</div>
              </div>
              <button onClick={disconnect} disabled={busy} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-bold text-ink-600 hover:text-ink-900 disabled:opacity-50">
                Disconnect
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-ink-200 bg-white">
              <div className="border-b border-ink-200 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink-500">
                Live vehicles ({vehicles.length})
              </div>
              {vehicles.length === 0 && <div className="p-4 text-sm text-ink-500">Waiting for first telemetry ping…</div>}
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between border-b border-ink-100 px-4 py-3 last:border-0">
                  <div>
                    <div className="font-bold">{v.name}</div>
                    <div className="text-xs text-ink-500">{v.driverName} · {v.lat.toFixed(3)}, {v.lon.toFixed(3)}</div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>{v.speedMph} mph</span>
                    <span>{v.fuelPct}% fuel</span>
                    <span className={v.drivingRemainingHours < 4 ? "text-red-600 font-bold" : ""}>
                      {v.drivingRemainingHours.toFixed(1)}h HOS
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-2">
        <ComingSoon name="Motive (KeepTruckin)" note="Requires partner approval" />
        <ComingSoon name="Geotab" note="Requires partner approval" />
      </section>

      <style jsx global>{`
        .input { width: 100%; border: 1px solid rgba(11,30,63,0.2); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
        .input:focus { outline: 2px solid #FF6B1A; outline-offset: -1px; }
      `}</style>
    </main>
  );
}

function ComingSoon({ name, note }: { name: string; note: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-dashed border-ink-300 bg-white/50 p-5">
      <div>
        <div className="font-bold">{name}</div>
        <div className="text-sm text-ink-500">{note}</div>
      </div>
      <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-ink-500">Soon</span>
    </div>
  );
}
