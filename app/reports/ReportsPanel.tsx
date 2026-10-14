"use client";

import { useEffect, useMemo, useState } from "react";

interface Report {
  id: string; kind: string; lat: number; lon: number;
  note: string | null; upvotes: number; createdAt: number; expiresAt: number;
}

const KINDS: Array<{ value: string; label: string; emoji: string }> = [
  { value: "parking_full", label: "Parking full", emoji: "P" },
  { value: "parking_open", label: "Parking open", emoji: "P+" },
  { value: "checkpoint", label: "Checkpoint", emoji: "!" },
  { value: "accident", label: "Accident", emoji: "X" },
  { value: "scale_open", label: "Scale open", emoji: "S" },
  { value: "scale_closed", label: "Scale closed", emoji: "S-" },
  { value: "hazard", label: "Hazard", emoji: "⚠" },
  { value: "fuel_out", label: "Fuel out", emoji: "⛽" },
  { value: "low_bridge", label: "Low bridge", emoji: "⌒" },
  { value: "construction", label: "Construction", emoji: "🚧" },
];

export function ReportsPanel() {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [kind, setKind] = useState("parking_full");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const emojiByKind = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.value, k.emoji])), []);

  async function load(p: { lat: number; lon: number }) {
    const r = await fetch(`/api/reports?lat=${p.lat}&lon=${p.lon}&radiusKm=80`);
    if (r.ok) setReports((await r.json()).reports ?? []);
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setPos({ lat: 32.7767, lon: -96.7970 }); // Dallas fallback
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (g) => setPos({ lat: g.coords.latitude, lon: g.coords.longitude }),
      () => setPos({ lat: 32.7767, lon: -96.7970 }),
      { timeout: 5000 },
    );
  }, []);

  useEffect(() => { if (pos) load(pos); }, [pos]);

  async function submit() {
    if (!pos) return;
    setBusy(true);
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, lat: pos.lat, lon: pos.lon, note: note || null }),
      });
      setNote("");
      await load(pos);
    } finally { setBusy(false); }
  }

  async function upvote(id: string) {
    await fetch(`/api/reports/${id}/upvote`, { method: "POST" });
    if (pos) load(pos);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-3xl font-black">Community reports</h1>
      <p className="text-ink-500">Anonymous, real-time alerts from nearby drivers. Short TTL — parking/scale reports expire in 4h.</p>

      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Add a report at your current location</div>
        <div className="mt-2 text-xs text-ink-500">
          {pos ? <>Location: {pos.lat.toFixed(3)}, {pos.lon.toFixed(3)}</> : <>Locating…</>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                kind === k.value ? "bg-ink-900 text-offwhite" : "border border-ink-200 text-ink-600"
              }`}
            >
              <span className="font-mono mr-1">{k.emoji}</span>{k.label}
            </button>
          ))}
        </div>
        <input
          className="mt-3 input"
          maxLength={280}
          placeholder="Optional note (visible to others)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          disabled={!pos || busy}
          onClick={submit}
          className="mt-3 rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Reporting…" : "Post anonymously"}
        </button>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">Active near you ({reports.length})</h2>
        <div className="mt-3 space-y-2">
          {reports.length === 0 && <div className="text-sm text-ink-500">Nothing reported in this area right now.</div>}
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-ink-200 bg-white p-3">
              <div>
                <div className="font-bold">
                  <span className="font-mono mr-2">{emojiByKind[r.kind] ?? "?"}</span>
                  {r.kind.replace(/_/g, " ")}
                </div>
                <div className="text-xs text-ink-500">
                  {new Date(r.createdAt).toLocaleTimeString()} · {r.lat.toFixed(3)}, {r.lon.toFixed(3)}
                </div>
                {r.note && <div className="mt-1 text-sm text-ink-700">{r.note}</div>}
              </div>
              <button onClick={() => upvote(r.id)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-bold">
                ▲ {r.upvotes}
              </button>
            </div>
          ))}
        </div>
      </section>

      <style jsx global>{`
        .input { width: 100%; border: 1px solid rgba(11,30,63,0.2); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
      `}</style>
    </main>
  );
}
