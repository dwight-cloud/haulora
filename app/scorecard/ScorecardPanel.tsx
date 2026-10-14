"use client";

import { useEffect, useState } from "react";

interface Summary {
  score: number;
  letter: "A" | "B" | "C" | "D" | "F";
  events: number;
  byKind: Array<{ kind: string; count: number; penalty: number }>;
  recent: Array<{ id: string; kind: string; severity: number; timestamp: number; lat: number | null; lon: number | null }>;
}

export function ScorecardPanel() {
  const [data, setData] = useState<Summary | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetch(`/api/scorecard?days=${days}`).then((r) => r.ok ? r.json() : null).then(setData);
  }, [days]);

  const color = data ? (data.score >= 90 ? "text-green-600" : data.score >= 70 ? "text-yellow-600" : "text-red-600") : "text-ink-900";

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-3xl font-black">Driver scorecard</h1>
      <p className="text-ink-500">Hard-brakes, speeding, idle time, rapid acceleration — tracked from the truck's motion sensors.</p>

      <div className="mt-4 flex gap-2">
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${days === d ? "bg-ink-900 text-offwhite" : "border border-ink-200"}`}
          >
            {d === 1 ? "Today" : `${d} days`}
          </button>
        ))}
      </div>

      {data && (
        <section className="mt-6 grid gap-6 sm:grid-cols-[200px_1fr]">
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-card text-center">
            <div className={`text-7xl font-black ${color}`}>{data.letter}</div>
            <div className="text-2xl font-bold">{data.score}</div>
            <div className="text-xs text-ink-500">{data.events} event{data.events === 1 ? "" : "s"}</div>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-card">
            <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Breakdown</div>
            {data.byKind.length === 0 && <div className="mt-3 text-sm text-ink-500">No events — perfect driving.</div>}
            <div className="mt-3 space-y-1.5">
              {data.byKind.map((k) => (
                <div key={k.kind} className="flex items-center gap-3 text-sm">
                  <div className="w-32 font-bold">{k.kind.replace(/_/g, " ")}</div>
                  <div className="flex-1 h-2 rounded bg-ink-50 overflow-hidden">
                    <div className="h-full bg-ink-900" style={{ width: `${Math.min(100, k.penalty * 4)}%` }} />
                  </div>
                  <div className="w-20 text-right text-ink-500 font-mono">{k.count} · -{k.penalty}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data && data.recent.length > 0 && (
        <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-5 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Recent events</div>
          <div className="mt-2 divide-y divide-ink-100">
            {data.recent.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-bold">{e.kind.replace(/_/g, " ")}</div>
                  <div className="text-xs text-ink-500">
                    {new Date(e.timestamp).toLocaleString()}
                    {e.lat != null && e.lon != null && <> · {e.lat.toFixed(3)}, {e.lon.toFixed(3)}</>}
                  </div>
                </div>
                <span className="rounded bg-ink-50 px-2 py-0.5 text-[10px] font-bold">sev {e.severity}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
