"use client";

import { useEffect, useState } from "react";

interface Defect { item: string; severity: "minor" | "major"; note?: string }
interface Report {
  id: string; truckId: string; kind: "pre" | "post";
  defects: Defect[]; odometer: number | null; createdAt: number;
}

export function DvirPanel() {
  const [checklist, setChecklist] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [kind, setKind] = useState<"pre" | "post">("pre");
  const [truckId, setTruckId] = useState("truck-01");
  const [odometer, setOdometer] = useState<string>("");
  const [defects, setDefects] = useState<Record<string, Defect>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/dvir");
    if (r.ok) {
      const d = await r.json();
      setChecklist(d.checklist ?? []);
      setReports(d.reports ?? []);
    }
  }
  useEffect(() => { load(); }, []);

  function toggleDefect(item: string, severity: "minor" | "major") {
    setDefects((prev) => {
      const cur = prev[item];
      const next = { ...prev };
      if (cur?.severity === severity) delete next[item];
      else next[item] = { item, severity };
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    try {
      await fetch("/api/dvir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind, truckId,
          odometer: odometer ? Number(odometer) : null,
          defects: Object.values(defects),
          signature: navigator.userAgent.slice(0, 40),
        }),
      });
      setDefects({}); setOdometer("");
      await load();
    } finally { setBusy(false); }
  }

  const hasMajor = Object.values(defects).some((d) => d.severity === "major");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-3xl font-black">Vehicle inspection (DVIR)</h1>
      <p className="text-ink-500">49 CFR §396.11 pre/post-trip inspection. Major defects flag the vehicle out-of-service.</p>

      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Inspection type</div>
            <div className="mt-1 flex gap-2">
              <button onClick={() => setKind("pre")} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${kind === "pre" ? "bg-ink-900 text-offwhite" : "border border-ink-200"}`}>Pre-trip</button>
              <button onClick={() => setKind("post")} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${kind === "post" ? "bg-ink-900 text-offwhite" : "border border-ink-200"}`}>Post-trip</button>
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Truck</span>
            <input className="mt-1 input" value={truckId} onChange={(e) => setTruckId(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Odometer</span>
            <input type="number" className="mt-1 input" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="miles" />
          </label>
        </div>

        <div className="mt-5 divide-y divide-ink-200">
          {checklist.map((item) => {
            const cur = defects[item];
            return (
              <div key={item} className="flex items-center justify-between py-2.5">
                <div className="font-medium">{item}</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setDefects((p) => { const n = { ...p }; delete n[item]; return n; })}
                    className={`rounded px-2 py-1 text-xs font-bold ${!cur ? "bg-green-500/15 text-green-700" : "border border-ink-200 text-ink-500"}`}
                  >OK</button>
                  <button
                    onClick={() => toggleDefect(item, "minor")}
                    className={`rounded px-2 py-1 text-xs font-bold ${cur?.severity === "minor" ? "bg-yellow-500/20 text-yellow-800" : "border border-ink-200 text-ink-500"}`}
                  >Minor</button>
                  <button
                    onClick={() => toggleDefect(item, "major")}
                    className={`rounded px-2 py-1 text-xs font-bold ${cur?.severity === "major" ? "bg-red-500/20 text-red-700" : "border border-ink-200 text-ink-500"}`}
                  >Major</button>
                </div>
              </div>
            );
          })}
        </div>

        {hasMajor && (
          <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm font-bold text-red-700">
            ⚠ Major defect — vehicle must not be operated until repaired.
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="mt-5 rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : `Certify ${kind}-trip inspection`}
        </button>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">Recent reports ({reports.length})</h2>
        <div className="mt-3 space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold">{r.kind === "pre" ? "Pre-trip" : "Post-trip"} · {r.truckId}</div>
                  <div className="text-xs text-ink-500">
                    {new Date(r.createdAt).toLocaleString()} {r.odometer ? `· ${r.odometer.toLocaleString()} mi` : ""}
                  </div>
                </div>
                <div>
                  {r.defects.length === 0
                    ? <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-700">NO DEFECTS</span>
                    : <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.defects.some((d) => d.severity === "major") ? "bg-red-500/15 text-red-700" : "bg-yellow-500/20 text-yellow-800"}`}>
                        {r.defects.length} defect{r.defects.length === 1 ? "" : "s"}
                      </span>}
                </div>
              </div>
              {r.defects.length > 0 && (
                <ul className="mt-2 text-xs text-ink-600">
                  {r.defects.map((d, i) => (
                    <li key={i}>• <b>{d.item}</b> ({d.severity})</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <style jsx global>{`
        .input { width: 100%; border: 1px solid rgba(11,30,63,0.2); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
        .input:focus { outline: 2px solid #FF6B1A; outline-offset: -1px; }
      `}</style>
    </main>
  );
}
