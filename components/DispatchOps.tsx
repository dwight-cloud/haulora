"use client";

import { useState } from "react";
import { HereMap } from "@/components/HereMap";

interface FleetTruck {
  id: string;
  name: string;
  driver: string;
  lat: number;
  lon: number;
  status: string;
  heightMeters: number;
  weightKg: number;
  axleCount?: number;
  hazardous?: boolean;
}

interface IsolineRing { polyline: string; label?: string; color?: string }
interface MatchRow { id: string; name: string; driver: string; etaMinutes: number | null }
interface HereIncident {
  id: string; description: string; type: string; criticality: number;
  position: { lat: number; lon: number };
}

/**
 * Dispatcher ops widget that sits on the dashboard below the fleet map.
 * Two modes:
 *   - Reach: pick a truck, overlay HERE isoline (1h/2h/4h) truck-legal polygons
 *   - Match: enter a pickup address, HERE matrix-rank fleet trucks by ETA
 */
export function DispatchOps({
  apiKey, trucks,
}: {
  apiKey: string;
  trucks: FleetTruck[];
}) {
  const [tab, setTab] = useState<"reach" | "match">("reach");

  // Reach
  const [reachTruckId, setReachTruckId] = useState(trucks[0]?.id ?? "");
  const [isolines, setIsolines] = useState<IsolineRing[]>([]);
  const [reachLoading, setReachLoading] = useState(false);

  // Match
  const [pickup, setPickup] = useState("");
  const [ranked, setRanked] = useState<MatchRow[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [pickupPin, setPickupPin] = useState<{ lat: number; lon: number } | null>(null);

  // Incidents (computed from pickup area or selected truck area)
  const [incidents, setIncidents] = useState<HereIncident[]>([]);

  async function computeReach() {
    const t = trucks.find((x) => x.id === reachTruckId);
    if (!t) return;
    setReachLoading(true); setIsolines([]); setIncidents([]);
    try {
      const u = new URL("/api/isoline", window.location.origin);
      u.searchParams.set("lat", String(t.lat));
      u.searchParams.set("lon", String(t.lon));
      u.searchParams.set("rangesHours", "1,2,4");
      u.searchParams.set("heightMeters", String(t.heightMeters));
      u.searchParams.set("weightKg", String(t.weightKg));
      if (t.axleCount) u.searchParams.set("axleCount", String(t.axleCount));
      if (t.hazardous) u.searchParams.set("hazardous", "true");
      const r = await fetch(u.toString(), { cache: "no-store" });
      if (!r.ok) throw new Error(`isoline: ${r.status}`);
      const d: { ranges: { rangeSeconds: number; polygon: string }[] } = await r.json();
      setIsolines(
        d.ranges.map((x) => ({
          polyline: x.polygon,
          label: `${Math.round(x.rangeSeconds / 3600)}h`,
        }))
      );
      // Fetch incidents in the rough bbox around truck (±1.5°)
      const inc = await fetch(
        `/api/here/incidents?west=${t.lon - 1.5}&east=${t.lon + 1.5}&south=${t.lat - 1.5}&north=${t.lat + 1.5}`,
        { cache: "no-store" }
      );
      if (inc.ok) setIncidents(((await inc.json()).incidents ?? []).slice(0, 60));
    } catch (e) {
      alert(`Reach failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setReachLoading(false);
    }
  }

  async function computeMatch() {
    if (!pickup.trim()) return;
    setMatchLoading(true); setRanked([]); setPickupPin(null); setIncidents([]);
    try {
      // Geocode pickup
      const g = await fetch(`/api/geocode?q=${encodeURIComponent(pickup)}`, { cache: "no-store" });
      if (!g.ok) throw new Error(`geocode failed: ${g.status}`);
      const gd: { lat: number; lon: number } = await g.json();
      setPickupPin(gd);
      // Matrix: all trucks → pickup
      const m = await fetch("/api/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origins: trucks.map((t) => ({ lat: t.lat, lon: t.lon })),
          destinations: [{ lat: gd.lat, lon: gd.lon }],
          // Profile is approximate — use the heaviest/tallest across fleet for a conservative rank
          profile: {
            heightMeters: Math.max(...trucks.map((t) => t.heightMeters), 4.11),
            weightKg:     Math.max(...trucks.map((t) => t.weightKg), 36000),
          },
        }),
      });
      if (!m.ok) throw new Error(`matrix: ${m.status}`);
      const md: { travelTimes: (number | null)[] } = await m.json();
      const rows: MatchRow[] = trucks.map((t, i) => ({
        id: t.id, name: t.name, driver: t.driver,
        etaMinutes: md.travelTimes[i] != null ? Math.round(md.travelTimes[i]! / 60) : null,
      }));
      rows.sort((a, b) => (a.etaMinutes ?? Infinity) - (b.etaMinutes ?? Infinity));
      setRanked(rows);
      // Incidents around pickup
      const inc = await fetch(
        `/api/here/incidents?west=${gd.lon - 1}&east=${gd.lon + 1}&south=${gd.lat - 1}&north=${gd.lat + 1}`,
        { cache: "no-store" }
      );
      if (inc.ok) setIncidents(((await inc.json()).incidents ?? []).slice(0, 60));
    } catch (e) {
      alert(`Match failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setMatchLoading(false);
    }
  }

  const markers = trucks.map((t) => ({ id: t.id, lat: t.lat, lon: t.lon, label: t.name }));
  if (pickupPin) markers.push({ id: "__pickup", lat: pickupPin.lat, lon: pickupPin.lon, label: "Pickup" });

  const selectedTruck = trucks.find((t) => t.id === reachTruckId);
  const mapCenter =
    tab === "reach" && selectedTruck ? { lat: selectedTruck.lat, lon: selectedTruck.lon } :
    tab === "match" && pickupPin      ? { lat: pickupPin.lat,     lon: pickupPin.lon } :
    undefined;

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">
            HERE ops
          </div>
          <h2 className="mt-1 text-xl font-bold">Reach & match</h2>
          <p className="text-xs text-ink-500">
            Truck-aware drive-time polygons and best-truck ETA ranking, powered by HERE.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-ink-50 p-1">
          <button
            onClick={() => setTab("reach")}
            className={`rounded px-3 py-1 text-xs font-bold ${tab === "reach" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"}`}
          >Reach</button>
          <button
            onClick={() => setTab("match")}
            className={`rounded px-3 py-1 text-xs font-bold ${tab === "match" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"}`}
          >Match</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
          {tab === "reach" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">Truck</label>
                <select
                  value={reachTruckId}
                  onChange={(e) => setReachTruckId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
                >
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {t.driver} ({(t.weightKg / 1000).toFixed(0)}t)</option>
                  ))}
                </select>
              </div>
              <button
                onClick={computeReach}
                disabled={reachLoading || !reachTruckId}
                className="w-full rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >{reachLoading ? "Computing…" : "Show reachability"}</button>
              {isolines.length > 0 && (
                <div className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
                  <div className="font-semibold mb-1">Legend</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-emerald-500/40" /> 1-hour drive</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-amber-500/40" /> 2-hour drive</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-red-500/40" /> 4-hour drive</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">Pickup address</label>
                <input
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="e.g. 1 Gaylord Blvd, Grapevine, TX"
                  className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") computeMatch(); }}
                />
              </div>
              <button
                onClick={computeMatch}
                disabled={matchLoading || !pickup.trim()}
                className="w-full rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >{matchLoading ? "Matching…" : "Rank trucks by ETA"}</button>

              {ranked.length > 0 && (
                <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                  {ranked.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600"}`}>{i + 1}</span>
                        <div>
                          <div className="font-bold">{r.name}</div>
                          <div className="text-xs text-ink-500">{r.driver}</div>
                        </div>
                      </div>
                      <div className="font-mono text-sm">
                        {r.etaMinutes == null ? "—" :
                         r.etaMinutes > 60 ? `${(r.etaMinutes / 60).toFixed(1)}h` : `${r.etaMinutes}m`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {incidents.length > 0 && (
            <div className="mt-4 rounded-lg bg-red-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-red-700">
                Traffic incidents near ({incidents.length})
              </div>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-red-800">
                {incidents.slice(0, 8).map((i) => (
                  <li key={i.id}>• <b>{i.type}</b> — {i.description}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white p-2 shadow-card">
          <HereMap
            apiKey={apiKey}
            markers={markers}
            center={mapCenter}
            zoom={mapCenter ? 7 : 5}
            isolines={isolines}
            incidents={incidents.map((i) => ({
              lat: i.position.lat, lon: i.position.lon,
              type: i.type, description: i.description, criticality: i.criticality,
            }))}
            height="520px"
          />
        </div>
      </div>
    </section>
  );
}
