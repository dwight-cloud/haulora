"use client";

import { useState } from "react";
import { HereMap } from "@/components/HereMap";
import { PlaceInput } from "@/components/PlaceInput";

interface Point {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
}

interface SequenceRow {
  id: string;
  sequenceIndex: number;
  label: string;
  lat: number;
  lon: number;
}

export function MultiStopSequencer({ apiKey }: { apiKey: string }) {
  const [start, setStart] = useState<Point>({ id: "start", label: "" });
  const [end,   setEnd]   = useState<Point>({ id: "end",   label: "" });
  const [stops, setStops] = useState<Point[]>([
    { id: "s1", label: "" },
    { id: "s2", label: "" },
  ]);
  const [improveFor, setImproveFor] = useState<"time" | "distance">("time");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sequence, setSequence] = useState<SequenceRow[] | null>(null);
  const [totals, setTotals] = useState<{ miles: number; hours: number } | null>(null);
  const [routePoly, setRoutePoly] = useState<string | undefined>(undefined);

  function updateStop(i: number, patch: Partial<Point>) {
    setStops((arr) => arr.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function addStop() {
    setStops((arr) => [...arr, { id: `s${arr.length + 1}`, label: "" }]);
  }
  function removeStop(i: number) {
    setStops((arr) => arr.filter((_, j) => j !== i));
  }

  async function compute() {
    setLoading(true); setErr(null); setSequence(null); setTotals(null); setRoutePoly(undefined);
    try {
      const body: Record<string, unknown> = {
        start: { id: "start", label: start.label, lat: start.lat, lon: start.lon },
        stops: stops
          .filter((s) => s.label.trim().length > 0)
          .map((s, i) => ({ id: `stop${i + 1}`, label: s.label, lat: s.lat, lon: s.lon })),
        improveFor,
      };
      if (end.label.trim().length > 0) {
        body.end = { id: "end", label: end.label, lat: end.lat, lon: end.lon };
      }
      const r = await fetch("/api/here/sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "sequence failed");
      setSequence(d.sequence);
      setTotals({ miles: d.distanceMiles, hours: d.durationHours });

      // Draw a concrete route across the ordered stops for visual verification.
      const seq: SequenceRow[] = d.sequence;
      if (seq.length >= 2) {
        const o = seq[0], dst = seq[seq.length - 1];
        const mid = seq.slice(1, -1).map((p) => ({ lat: p.lat, lon: p.lon }));
        const routeRes = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: `${o.lat},${o.lon}`,
            destination: `${dst.lat},${dst.lon}`,
            via: mid,
            heightMeters: 4.11, weightKg: 36000, axleCount: 5, hazardous: false,
          }),
        });
        if (routeRes.ok) {
          const rd = await routeRes.json();
          setRoutePoly(rd.polyline);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "sequence failed");
    } finally {
      setLoading(false);
    }
  }

  const markers = sequence
    ? sequence.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, label: `${s.sequenceIndex + 1}. ${s.label}` }))
    : [];
  const center = sequence && sequence.length > 0
    ? { lat: sequence.reduce((a, s) => a + s.lat, 0) / sequence.length,
        lon: sequence.reduce((a, s) => a + s.lon, 0) / sequence.length }
    : undefined;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
      <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card space-y-3">
        <PlaceInput
          label="Pickup (start)"
          value={start.label}
          onChange={(v) => setStart((s) => ({ ...s, label: v, lat: undefined, lon: undefined }))}
          onSelect={(p) => setStart({ id: "start", label: p.address, lat: p.position.lat, lon: p.position.lon })}
          placeholder="Start address"
        />

        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Stops (HERE optimizes the order)</div>
          <div className="mt-2 space-y-2">
            {stops.map((s, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex-1">
                  <PlaceInput
                    label={`Stop ${i + 1}`}
                    value={s.label}
                    onChange={(v) => updateStop(i, { label: v, lat: undefined, lon: undefined })}
                    onSelect={(p) => updateStop(i, { label: p.address, lat: p.position.lat, lon: p.position.lon })}
                    placeholder="Drop address"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeStop(i)}
                  className="self-end rounded-lg border border-ink-200 px-2 py-2 text-xs text-ink-500 hover:text-red-700"
                  title="Remove stop"
                >✕</button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addStop}
            className="mt-2 text-xs font-semibold text-ink-600 hover:text-ink-900"
          >+ Add another stop</button>
        </div>

        <PlaceInput
          label="Return to (optional)"
          value={end.label}
          onChange={(v) => setEnd((s) => ({ ...s, label: v, lat: undefined, lon: undefined }))}
          onSelect={(p) => setEnd({ id: "end", label: p.address, lat: p.position.lat, lon: p.position.lon })}
          placeholder="Leave blank for open tour"
        />

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">Optimize for</label>
          <div className="flex gap-1 rounded-lg bg-ink-50 p-1">
            {(["time", "distance"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setImproveFor(k)}
                className={`rounded px-3 py-1 text-xs font-bold capitalize ${
                  improveFor === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
                }`}
              >{k}</button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={compute}
          disabled={loading || !start.label.trim() || stops.filter((s) => s.label.trim()).length === 0}
          className="w-full rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? "Optimizing…" : "Optimize order"}
        </button>
        {err && <div className="rounded bg-red-50 p-2 text-xs text-red-700">{err}</div>}

        {sequence && (
          <div className="space-y-2">
            {totals && (
              <div className="rounded-lg bg-ink-50 p-3 text-sm">
                <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Optimized tour</div>
                <div className="mt-1 flex gap-4 font-mono">
                  <div><b>{totals.miles.toFixed(0)}</b> mi</div>
                  <div><b>{totals.hours.toFixed(1)}</b> h</div>
                </div>
              </div>
            )}
            <ol className="divide-y divide-ink-100 rounded-lg border border-ink-200">
              {sequence.map((s, i) => (
                <li key={s.id} className="flex items-start gap-3 px-3 py-2">
                  <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{s.label}</div>
                    <div className="font-mono text-[10px] text-ink-500">{s.lat.toFixed(4)}, {s.lon.toFixed(4)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white p-2 shadow-card">
        <HereMap
          apiKey={apiKey}
          markers={markers}
          polyline={routePoly}
          center={center}
          zoom={center ? 7 : 5}
          height="640px"
        />
      </div>
    </div>
  );
}
