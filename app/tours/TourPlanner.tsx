"use client";

import { useState } from "react";
import { HereMap } from "@/components/HereMap";
import { PlaceInput } from "@/components/PlaceInput";

interface JobInput {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
  demand: number;
}
interface FleetInput {
  id: string;
  amount: number;
  capacity: number;
  depotLabel: string;
  depotLat?: number;
  depotLon?: number;
  shiftStart: string;   // HH:MM
  shiftEnd: string;
}

interface Stop {
  jobId: string;
  location: { lat: number; lon: number };
  arrivalISO?: string;
  departureISO?: string;
  activityType: string;
  loadAfter?: number[];
}
interface Tour {
  vehicleId: string;
  typeId: string;
  stops: Stop[];
  distanceMeters?: number;
  durationSeconds?: number;
}
interface Solution {
  tours: Tour[];
  unassigned: Array<{ jobId: string; reasons: string[] }>;
  statistic: { costTotal?: number; distanceMeters: number; durationSeconds: number };
  totalMiles: number;
  totalHours: number;
  tourCount: number;
  stopCount: number;
}

const TOUR_COLORS = [
  "#FF6B1A", "#1F8BFF", "#10B981", "#6B21A8", "#B91C1C", "#EAB308",
];

export function TourPlanner({ apiKey }: { apiKey: string }) {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const [date, setDate] = useState(iso);

  const [fleet, setFleet] = useState<FleetInput>({
    id: "box-truck",
    amount: 2,
    capacity: 5000,
    depotLabel: "Dallas, TX",
    shiftStart: "08:00",
    shiftEnd:   "18:00",
  });

  const [jobs, setJobs] = useState<JobInput[]>([
    { id: "j1", label: "",  demand: 1000 },
    { id: "j2", label: "",  demand: 1500 },
    { id: "j3", label: "",  demand: 1200 },
  ]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [activeTourIdx, setActiveTourIdx] = useState<number | null>(null);

  function updateJob(i: number, patch: Partial<JobInput>) {
    setJobs((arr) => arr.map((j, k) => (k === i ? { ...j, ...patch } : j)));
  }
  function addJob() {
    setJobs((arr) => [...arr, { id: `j${arr.length + 1}`, label: "", demand: 1000 }]);
  }
  function removeJob(i: number) {
    setJobs((arr) => arr.filter((_, k) => k !== i));
  }

  async function optimize() {
    setLoading(true); setErr(null); setSolution(null); setActiveTourIdx(null);
    try {
      const startISO = new Date(`${date}T${fleet.shiftStart}:00`).toISOString();
      const endISO   = new Date(`${date}T${fleet.shiftEnd}:00`).toISOString();
      const body = {
        types: [{
          id: fleet.id || "truck",
          amount: fleet.amount,
          capacity: [fleet.capacity],
          shiftStart: { iso: startISO, location: fleet.depotLat != null && fleet.depotLon != null
            ? { lat: fleet.depotLat, lon: fleet.depotLon }
            : { label: fleet.depotLabel } },
          shiftEnd:   { iso: endISO, location: fleet.depotLat != null && fleet.depotLon != null
            ? { lat: fleet.depotLat, lon: fleet.depotLon }
            : { label: fleet.depotLabel } },
        }],
        jobs: jobs
          .filter((j) => j.label.trim().length > 0)
          .map((j, i) => ({
            id: `job-${i + 1}`,
            location: j.lat != null && j.lon != null
              ? { lat: j.lat, lon: j.lon }
              : { label: j.label },
            demand: [j.demand],
            serviceDurationSec: 900,
          })),
      };
      const r = await fetch("/api/here/tour-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "tour plan failed");
      setSolution(d);
      if (d.tours?.length) setActiveTourIdx(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "tour plan failed");
    } finally {
      setLoading(false);
    }
  }

  // Build markers for the active tour (or all tours if none selected)
  const markers: Array<{ id: string; lat: number; lon: number; label?: string }> = [];
  if (solution) {
    const toursToShow = activeTourIdx == null
      ? solution.tours
      : [solution.tours[activeTourIdx]];
    toursToShow.forEach((t, ti) => {
      t.stops.forEach((s, si) => {
        markers.push({
          id: `${t.vehicleId}-${si}`,
          lat: s.location.lat,
          lon: s.location.lon,
          label: `${activeTourIdx == null ? `T${ti + 1}·` : ""}${si + 1}. ${s.jobId}`,
        });
      });
    });
  }
  const center = markers.length
    ? { lat: markers.reduce((a, m) => a + m.lat, 0) / markers.length,
        lon: markers.reduce((a, m) => a + m.lon, 0) / markers.length }
    : undefined;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[460px_1fr]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Fleet</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vehicles">
              <input type="number" min={1} max={20} className="input"
                value={fleet.amount}
                onChange={(e) => setFleet({ ...fleet, amount: Math.max(1, parseInt(e.target.value || "1")) })} />
            </Field>
            <Field label="Capacity each (kg)">
              <input type="number" min={100} className="input"
                value={fleet.capacity}
                onChange={(e) => setFleet({ ...fleet, capacity: Math.max(1, parseInt(e.target.value || "1")) })} />
            </Field>
          </div>
          <div>
            <PlaceInput
              label="Depot"
              value={fleet.depotLabel}
              onChange={(v) => setFleet({ ...fleet, depotLabel: v, depotLat: undefined, depotLon: undefined })}
              onSelect={(p) => setFleet({ ...fleet, depotLabel: p.address, depotLat: p.position.lat, depotLon: p.position.lon })}
              placeholder="Home yard address"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Date">
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Start">
              <input type="time" className="input" value={fleet.shiftStart} onChange={(e) => setFleet({ ...fleet, shiftStart: e.target.value })} />
            </Field>
            <Field label="End">
              <input type="time" className="input" value={fleet.shiftEnd} onChange={(e) => setFleet({ ...fleet, shiftEnd: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Jobs</div>
            <button type="button" onClick={addJob} className="text-xs font-semibold text-ink-600 hover:text-ink-900">+ Add job</button>
          </div>
          <div className="space-y-3">
            {jobs.map((j, i) => (
              <div key={i} className="rounded-lg border border-ink-200 p-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <PlaceInput
                      label={`Job ${i + 1}`}
                      value={j.label}
                      onChange={(v) => updateJob(i, { label: v, lat: undefined, lon: undefined })}
                      onSelect={(p) => updateJob(i, { label: p.address, lat: p.position.lat, lon: p.position.lon })}
                      placeholder="Drop address"
                    />
                  </div>
                  <Field label="Demand (kg)">
                    <input type="number" min={1} className="input"
                      value={j.demand}
                      onChange={(e) => updateJob(i, { demand: Math.max(1, parseInt(e.target.value || "1")) })} />
                  </Field>
                  <button type="button"
                    onClick={() => removeJob(i)}
                    className="h-10 rounded-lg border border-ink-200 px-2 text-xs text-ink-500 hover:text-red-700"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={optimize}
          disabled={loading || jobs.filter((j) => j.label.trim()).length === 0 || !fleet.depotLabel.trim()}
          className="w-full rounded-lg bg-ink-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? "Optimizing…" : "Optimize tours"}
        </button>
        {err && <div className="rounded bg-red-50 p-2 text-xs text-red-700">{err}</div>}

        {solution && (
          <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Solution</div>
                <div className="mt-0.5 text-xs text-ink-500">
                  {solution.tourCount} tours · {solution.stopCount} stops · {solution.totalMiles.toFixed(0)} mi · {solution.totalHours.toFixed(1)} h
                  {solution.statistic.costTotal != null && <> · cost <b>{solution.statistic.costTotal.toFixed(2)}</b></>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTourIdx(null)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${activeTourIdx == null ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-50"}`}
              >All tours</button>
            </div>

            {solution.tours.map((t, i) => {
              const col = TOUR_COLORS[i % TOUR_COLORS.length];
              return (
                <div key={t.vehicleId}
                  className={`rounded-lg border p-2 transition ${activeTourIdx === i ? "border-ink-900 bg-ink-50/60" : "border-ink-200 hover:border-ink-300"}`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTourIdx(activeTourIdx === i ? null : i)}
                    className="flex w-full items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: col }} />
                      <span className="font-bold text-sm">Tour {i + 1}</span>
                      <span className="text-xs text-ink-500">{t.vehicleId}</span>
                    </div>
                    <div className="font-mono text-xs text-ink-600">
                      {t.distanceMeters != null && <>{(t.distanceMeters / 1609.344).toFixed(0)} mi · </>}
                      {t.durationSeconds != null && <>{(t.durationSeconds / 3600).toFixed(1)} h</>}
                    </div>
                  </button>
                  <ol className="mt-1 space-y-0.5 pl-4 text-xs text-ink-600">
                    {t.stops.map((s, si) => (
                      <li key={si}>
                        <span className="inline-block w-5 font-mono text-ink-400">{si + 1}.</span>
                        <span className="font-semibold capitalize">{s.activityType}</span>
                        <span className="ml-1 text-ink-500">{s.jobId}</span>
                        {s.arrivalISO && (
                          <span className="ml-2 font-mono text-[10px] text-ink-400">
                            {new Date(s.arrivalISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}

            {solution.unassigned.length > 0 && (
              <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
                <div className="font-bold">Unassigned ({solution.unassigned.length})</div>
                <ul className="mt-0.5 space-y-0.5">
                  {solution.unassigned.map((u) => (
                    <li key={u.jobId}>• <b>{u.jobId}</b> — {u.reasons.join("; ") || "no feasible slot"}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white p-2 shadow-card">
        <HereMap
          apiKey={apiKey}
          markers={markers}
          center={center}
          zoom={center ? 7 : 5}
          height="640px"
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
