"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HereMap } from "@/components/HereMap";
import { PlaceInput } from "@/components/PlaceInput";
import { PageHeader } from "@/components/ui/primitives";

interface RouteOption {
  polyline: string;
  distanceMiles: number;
  durationHours: number;
  notices: Array<{ title: string; severity: string }>;
  tolls?: { currency?: string; total?: number };
  topTruckSpeedMph?: number;
  spanSummary?: { minMph: number; maxMph: number; avgMph: number };
  truckSpeedWarnings?: { restrictedSegments: number; minTruckMph: number; totalSegments: number };
  risk: { score: number; level: string; factors: Array<{ label: string; weight: number }> };
}

interface PlanResult extends RouteOption {
  origin: { query: string; lat: number; lon: number };
  destination: { query: string; lat: number; lon: number };
  alternates: RouteOption[];
}

interface WeatherSample {
  lat: number; lon: number; time: string;
  temperatureF?: number; windSpeedMph?: number; windDirection?: string;
  precipChance?: number; shortForecast?: string; icon?: string;
  warnings: string[];
}

interface Driver { id: string; name: string; email: string }

interface HereIncident {
  id: string;
  description: string;
  type: string;
  criticality: number;
  startTime?: string;
  endTime?: string;
  position: { lat: number; lon: number };
  roadName?: string;
}

export function Planner() {
  const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY ?? "";
  const [origin, setOrigin] = useState("Dallas, TX");
  const [destination, setDestination] = useState("Houston, TX");
  const [heightMeters, setHeight] = useState(4.11);
  const [weightKg, setWeight] = useState(36000);
  const [axleCount, setAxleCount] = useState(5);
  const [hazardous, setHazardous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [selected, setSelected] = useState(0); // 0 = primary; 1..n = alternate index
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSample[]>([]);
  const [incidents, setIncidents] = useState<HereIncident[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  // Driver assignment
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team/drivers").then((r) => r.ok ? r.json() : { drivers: [] })
      .then((d) => {
        setDrivers(d.drivers ?? []);
        if (d.drivers?.[0]) setDriverId(d.drivers[0].id);
      })
      .catch(() => {});
  }, []);

  async function assignToDriver() {
    if (!result || !active || !driverId) return;
    setAssigning(true); setAssignMsg(null);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          driverId,
          originLabel: origin, destLabel: destination,
          originLat: result.origin.lat, originLon: result.origin.lon,
          destLat: result.destination.lat, destLon: result.destination.lon,
          polyline: active.polyline,
          distanceMiles: active.distanceMiles,
          durationHours: active.durationHours,
          riskScore: active.risk.score,
          heightMeters, weightKg, axleCount, hazardous,
          note: assignNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "assign failed");
      const driverName = drivers.find((d) => d.id === driverId)?.name ?? "driver";
      setAssignMsg(`✓ Assigned to ${driverName}`);
      setAssignNote("");
    } catch (e) {
      setAssignMsg(e instanceof Error ? e.message : "assign failed");
    } finally {
      setAssigning(false);
    }
  }

  // Pre-fill from query params (from dashboard "Plan route" click)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const o = sp.get("origin");
    const d = sp.get("destination");
    if (o) setOrigin(o);
    if (d) setDestination(d);
    const h = sp.get("heightMeters"); if (h) setHeight(parseFloat(h));
    const w = sp.get("weightKg");     if (w) setWeight(parseInt(w));
    const a = sp.get("axleCount");    if (a) setAxleCount(parseInt(a));
    const hz = sp.get("hazardous");   if (hz != null) setHazardous(hz === "1" || hz === "true");
    if (sp.get("auto") === "1" && o && d) {
      // Auto-run after state settles
      setTimeout(() => formRef.current?.requestSubmit(), 0);
    }
  }, []);

  const options: RouteOption[] = useMemo(() => {
    if (!result) return [];
    return [
      { polyline: result.polyline, distanceMiles: result.distanceMiles, durationHours: result.durationHours, notices: result.notices, tolls: result.tolls, risk: result.risk, topTruckSpeedMph: result.topTruckSpeedMph, spanSummary: result.spanSummary, truckSpeedWarnings: result.truckSpeedWarnings },
      ...result.alternates,
    ];
  }, [result]);
  const active = options[selected] ?? options[0];

  async function plan(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null); setSelected(0); setWeather([]); setIncidents([]);
    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin, destination, heightMeters, weightKg, axleCount, hazardous }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
      // Fetch weather along the primary route (NOAA is slow so we don't await it before showing the route)
      fetch("/api/weather/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ polyline: data.polyline, durationHours: data.durationHours, samples: 5 }),
      }).then((r) => r.ok ? r.json() : { samples: [] })
        .then((w) => setWeather(w.samples ?? []))
        .catch(() => {});
      // HERE traffic incidents along the route (corridor-filtered server-side)
      fetch(`/api/here/incidents?polyline=${encodeURIComponent(data.polyline)}&corridorKm=10`)
        .then((r) => r.ok ? r.json() : { incidents: [] })
        .then((d) => setIncidents(d.incidents ?? []))
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Dispatch"
          title="Route planner"
          subtitle="Truck-legal routing via HERE with risk scoring, tolls, and live alternates."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <form ref={formRef} onSubmit={plan} className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
            <PlaceInput label="Origin" value={origin} onChange={setOrigin} placeholder="Address, city, or place" />
            <PlaceInput label="Destination" value={destination} onChange={setDestination} placeholder="Address, city, or place" />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Height (m)">
                <input type="number" step="0.01" className="input" value={heightMeters}
                  onChange={(e) => setHeight(parseFloat(e.target.value))} />
              </Field>
              <Field label="Weight (kg)">
                <input type="number" className="input" value={weightKg}
                  onChange={(e) => setWeight(parseInt(e.target.value))} />
              </Field>
              <Field label="Axles">
                <input type="number" min={2} max={9} className="input" value={axleCount}
                  onChange={(e) => setAxleCount(parseInt(e.target.value))} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hazardous} onChange={(e) => setHazardous(e.target.checked)} />
              Hazmat load
            </label>
            <button
              disabled={loading}
              className="w-full rounded bg-ink-900 py-2.5 font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Planning…" : "Plan truck-legal route"}
            </button>
            {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {result && active && (
              <div className="space-y-3 rounded bg-ink-50 p-4">
                {active.notices.some((n) => /violat/i.test(n.title) || n.severity === "critical") && (
                  <div className="rounded-lg border-2 border-red-500 bg-red-50 p-3">
                    <div className="flex items-center gap-2 font-bold text-red-700">
                      <span className="text-lg">⚠</span> Route violates a vehicle restriction
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-red-700">
                      {active.notices
                        .filter((n) => /violat/i.test(n.title) || n.severity === "critical")
                        .map((n, i) => (
                          <li key={i}>• {n.title}</li>
                        ))}
                    </ul>
                    <div className="mt-2 text-xs text-red-700/80">
                      HERE found no fully-compliant alternative for this vehicle profile. Review the route, adjust the load (weight, axles, hazmat), or file a permit before dispatching.
                    </div>
                  </div>
                )}
                {options.length > 1 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-ink-500 mb-1.5">Routes</div>
                    <div className="flex gap-1.5">
                      {options.map((o, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelected(i)}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                            i === selected ? "border-ink-900 bg-white shadow-sm" : "border-ink-200 bg-white/60 hover:bg-white"
                          }`}
                        >
                          <div className="font-bold">{i === 0 ? "Recommended" : `Alt ${i}`}</div>
                          <div className="text-ink-500">{o.distanceMiles.toFixed(0)}mi · {o.durationHours.toFixed(1)}h</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat label="Miles" value={active.distanceMiles.toFixed(0)} />
                  <Stat label="Drive" value={`${active.durationHours.toFixed(1)}h`} />
                  <Stat label="Risk" value={String(active.risk.score)} />
                  <Stat label="Tolls" value={
                    active.tolls?.total != null
                      ? `${active.tolls.currency === "USD" ? "$" : ""}${active.tolls.total.toFixed(0)}`
                      : "—"
                  } />
                </div>

                {active.spanSummary && (
                  <div className="text-xs text-ink-600">
                    Truck speed along route: <b>{active.spanSummary.minMph}</b>–<b>{active.spanSummary.maxMph}</b> mph
                    {" "}(avg {active.spanSummary.avgMph})
                  </div>
                )}

                {active.truckSpeedWarnings && (
                  <div className="rounded-lg border border-amber-400 bg-amber-50 p-2 text-xs">
                    <div className="font-bold text-amber-900">Truck-specific speed limits on this route</div>
                    <div className="mt-0.5 text-amber-900/80">
                      {active.truckSpeedWarnings.restrictedSegments} of{" "}
                      {active.truckSpeedWarnings.totalSegments} segments restrict trucks below the posted
                      car limit — lowest truck limit is <b>{active.truckSpeedWarnings.minTruckMph} mph</b>.
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                    Risk: {active.risk.level}
                  </div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {active.risk.factors.length === 0 && <li className="text-ink-500">No elevated factors.</li>}
                    {active.risk.factors.map((f, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{f.label}</span>
                        <span className="font-mono text-ink-900">+{f.weight}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {weather.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Weather along route</div>
                    <div className="mt-1.5 space-y-1.5">
                      {weather.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-xs">
                          <span className="w-12 font-mono text-ink-500">
                            {new Date(w.time).toLocaleTimeString([], { hour: "numeric" })}
                          </span>
                          <span className="flex-1 truncate">{w.shortForecast ?? "—"}</span>
                          {w.temperatureF != null && <span className="font-semibold">{w.temperatureF}°F</span>}
                          {w.windSpeedMph != null && (
                            <span className={w.warnings.includes("high_wind") ? "font-bold text-red-600" : "text-ink-500"}>
                              {w.windSpeedMph}mph {w.windDirection}
                            </span>
                          )}
                          {w.warnings.length > 0 && (
                            <span className="flex gap-1">
                              {w.warnings.map((x) => (
                                <span key={x} className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                  {x.replace("_", " ")}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {drivers.length > 0 && (
                  <div className="border-t border-ink-200 pt-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-ink-500 mb-1.5">Assign to driver</div>
                    <div className="flex gap-2">
                      <select
                        value={driverId}
                        onChange={(e) => setDriverId(e.target.value)}
                        className="input flex-1"
                      >
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>{d.name} ({d.email})</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={assignToDriver}
                        disabled={assigning || !driverId}
                        className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-offwhite disabled:opacity-50"
                      >
                        {assigning ? "…" : "Assign"}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={assignNote}
                      onChange={(e) => setAssignNote(e.target.value)}
                      placeholder="Note for driver (optional)"
                      className="input mt-2 text-sm"
                    />
                    {assignMsg && (
                      <div className={`mt-2 text-xs font-semibold ${assignMsg.startsWith("✓") ? "text-green-700" : "text-red-700"}`}>
                        {assignMsg}
                      </div>
                    )}
                  </div>
                )}

                {incidents.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                      Live traffic incidents ({incidents.length})
                    </div>
                    <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-sm">
                      {incidents.slice(0, 12).map((i) => (
                        <li key={i.id} className="flex items-start gap-2 rounded bg-white px-2 py-1">
                          <span
                            className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                            style={{ background: ["#EAB308", "#F59E0B", "#EF4444", "#B91C1C"][i.criticality] ?? "#EF4444" }}
                          />
                          <div className="flex-1">
                            <span className="font-semibold capitalize">{i.type.replace(/([A-Z])/g, " $1").trim()}</span>
                            <span className="mx-1 text-ink-300">·</span>
                            <span className="text-ink-600">{i.description}</span>
                            {i.roadName && <span className="ml-1 text-xs text-ink-500">({i.roadName})</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {active.notices.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Route notices</div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {active.notices.map((n, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <SeverityDot s={n.severity} />
                          <span>{n.title} <span className="text-ink-500">({n.severity})</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </form>

          <HereMap
            apiKey={apiKey}
            polyline={active?.polyline}
            alternates={options.slice(1).map((o, i) => ({ polyline: o.polyline, label: `Alt ${i + 1}` }))}
            onSelectAlternate={(i) => setSelected(i + 1)}
            center={result ? { lat: (result.origin.lat + result.destination.lat) / 2, lon: (result.origin.lon + result.destination.lon) / 2 } : undefined}
            zoom={result ? 6 : 5}
            incidents={incidents.map((i) => ({
              lat: i.position.lat, lon: i.position.lon,
              type: i.type, description: i.description, criticality: i.criticality,
            }))}
            height="640px"
          />
        </div>
      </main>

      <style jsx global>{`
        .input { width: 100%; border: 1px solid rgba(11,30,63,0.2); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
        .input:focus { outline: 2px solid #FF6B1A; outline-offset: -1px; }
      `}</style>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white p-2">
      <div className="text-[10px] uppercase tracking-widest text-ink-500">{label}</div>
      <div className="text-lg font-black">{value}</div>
    </div>
  );
}

function SeverityDot({ s }: { s: string }) {
  const color = s === "critical" ? "bg-red-500" : s === "warning" ? "bg-yellow-500" : "bg-navy/40";
  return <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${color}`} />;
}
