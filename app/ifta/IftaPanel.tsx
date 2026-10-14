"use client";

import { useEffect, useState } from "react";

interface IftaReport {
  quarter: string;
  totalMiles: number;
  segments: number;
  byState: Array<{ state: string; miles: number }>;
}

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

export function IftaPanel() {
  const [quarter, setQuarter] = useState(currentQuarter());
  const [report, setReport] = useState<IftaReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/ifta/report?quarter=${encodeURIComponent(quarter)}`);
      if (r.ok) setReport(await r.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [quarter]);

  const maxMiles = report?.byState[0]?.miles ?? 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-3xl font-black">IFTA mileage</h1>
      <p className="text-ink-500">
        Miles driven per jurisdiction for International Fuel Tax Agreement quarterly returns. Computed from GPS trip points.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">Quarter</label>
        <select className="input max-w-[160px]" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
          {recentQuarters().map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>

      {loading && <div className="mt-4 text-sm text-ink-500">Loading…</div>}

      {report && (
        <>
          <section className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="Total miles" value={report.totalMiles.toLocaleString()} />
            <Stat label="GPS segments" value={report.segments.toLocaleString()} />
            <Stat label="States" value={String(report.byState.length)} />
          </section>

          <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-5 shadow-card">
            <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Miles by state</div>
            <div className="mt-3 space-y-1.5">
              {report.byState.length === 0 && <div className="text-sm text-ink-500">No trip data for this quarter. Log GPS points from the iOS app to build this report.</div>}
              {report.byState.map((s) => (
                <div key={s.state} className="flex items-center gap-3 text-sm">
                  <div className="w-10 font-mono font-bold">{s.state}</div>
                  <div className="flex-1 h-3 rounded bg-ink-50 overflow-hidden">
                    <div className="h-full bg-ink-900" style={{ width: `${(s.miles / Math.max(maxMiles, 1)) * 100}%` }} />
                  </div>
                  <div className="w-24 text-right font-mono">{s.miles.toLocaleString()} mi</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <style jsx global>{`
        .input { border: 1px solid rgba(11,30,63,0.2); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
      `}</style>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function recentQuarters(): string[] {
  const out: string[] = [];
  const now = new Date();
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    out.push(`${y}-Q${q}`);
    q--; if (q === 0) { q = 4; y--; }
  }
  return out;
}
