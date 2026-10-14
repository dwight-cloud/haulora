"use client";

import { useEffect, useState } from "react";

type HosStatus = "driving" | "on_duty" | "sleeper" | "off_duty";

interface HosState {
  current: HosStatus;
  sinceMs: number;
  drivingRemainingHours: number;
  windowRemainingHours: number;
  cycleRemainingHours: number;
  breakDueHours: number | null;
  lastReset: number | null;
}

interface HosEvent {
  id: string;
  status: HosStatus;
  timestamp: number;
  source: string;
}

const LABEL: Record<HosStatus, string> = {
  driving: "Driving",
  on_duty: "On Duty",
  sleeper: "Sleeper",
  off_duty: "Off Duty",
};

const TONE: Record<HosStatus, string> = {
  driving:  "bg-green-600 text-white",
  on_duty:  "bg-yellow-500 text-ink-900",
  sleeper:  "bg-indigo-600 text-white",
  off_duty: "bg-ink-100 text-ink-900",
};

export function HosDashboard() {
  const [state, setState] = useState<HosState | null>(null);
  const [events, setEvents] = useState<HosEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/hos/events");
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const d = await res.json();
      setState(d.state);
      setEvents(d.events);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load error");
    }
  }

  async function set(status: HosStatus) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/hos/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save error");
    } finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Driver</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Hours of Service</h1>
        <p className="mt-1 text-ink-500">FMCSA 395: 11-hour drive · 14-hour window · 70 / 8-day cycle</p>
      </div>

      {err && <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {/* Current status card */}
      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Current status</div>
            <div className="mt-2 flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-bold uppercase tracking-widest ${state ? TONE[state.current] : "bg-ink-100 text-ink-900"}`}>
                {state ? LABEL[state.current] : "—"}
              </span>
              {state && <span className="text-sm text-ink-500">{humanizeDuration(state.sinceMs)}</span>}
            </div>
          </div>
          {state?.breakDueHours != null && state.breakDueHours <= 0.5 && (
            <span className="rounded-lg bg-yellow-500/15 px-3 py-1.5 text-xs font-bold text-yellow-800">
              30-min break required
            </span>
          )}
        </div>

        {/* Big four buttons */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(LABEL) as HosStatus[]).map((k) => (
            <button
              key={k}
              disabled={busy || state?.current === k}
              onClick={() => set(k)}
              className={`rounded-xl border p-4 text-center font-bold transition ${
                state?.current === k
                  ? "border-ink-900 bg-ink-100 text-ink-900"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
              } disabled:opacity-50`}
            >
              {LABEL[k]}
            </button>
          ))}
        </div>
      </section>

      {/* Clocks */}
      <section className="mt-6 grid gap-3 md:grid-cols-3">
        <ClockCard label="11-hour drive"   remaining={state?.drivingRemainingHours ?? 11} max={11} />
        <ClockCard label="14-hour window"  remaining={state?.windowRemainingHours ?? 14} max={14} />
        <ClockCard label="70-hour / 8 day" remaining={state?.cycleRemainingHours ?? 70} max={70} />
      </section>

      {/* Recent log */}
      <section className="mt-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-500">Recent log (8 days)</div>
        <div className="rounded-2xl border border-ink-200 bg-white p-2 shadow-card">
          {events.length === 0 && (
            <div className="p-4 text-sm text-ink-500">No events yet — tap a status above to start logging.</div>
          )}
          {events.slice().reverse().map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-ink-100 px-3 py-2 last:border-0">
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${TONE[e.status]}`}>
                  {LABEL[e.status]}
                </span>
                <span className="text-sm">{new Date(e.timestamp).toLocaleString()}</span>
              </div>
              <span className="text-xs text-ink-500">{e.source}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function ClockCard({ label, remaining, max }: { label: string; remaining: number; max: number }) {
  const pct = Math.max(0, Math.min(1, remaining / max));
  const tone = pct > 0.5 ? "bg-green-500" : pct > 0.2 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{remaining.toFixed(1)}<span className="text-lg text-ink-500">h</span></div>
      <div className="mt-2 h-2 rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="mt-1 text-xs text-ink-500">of {max}h</div>
    </div>
  );
}

function humanizeDuration(ms: number): string {
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m in status`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m in status`;
}
