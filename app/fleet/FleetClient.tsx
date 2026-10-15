"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { HereMap } from "@/components/HereMap";
import { Button, Card, CardBody, CardHeader, CardTitle, ErrorBanner, PageHeader, Pill } from "@/components/ui/primitives";
import type { Load, Truck } from "@/lib/domain/types";
import { api, ApiError, fmtDateTime } from "@/lib/ui/format";
import { IN_FLIGHT, TRUCK_STATUS_LABEL, TRUCK_STATUS_TONE, hoursLeftToday, nearestPlace, shortPlace, truckType } from "@/lib/ui/fleet";

const POLL_MS = 15000;

export function FleetClient({ apiKey }: { apiKey: string }) {
  const [trucks, setTrucks] = useState<Truck[] | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ loads: Load[]; trucks: Truck[] }>("/api/loads");
      setTrucks(d.trucks); setLoads(d.loads); setUpdated(Date.now()); setError(null);
    } catch (e) { if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : "Load failed"); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [refresh]);

  const list = trucks ?? [];
  const moving = list.filter((t) => t.status === "moving").length;
  const idle = list.filter((t) => t.status === "idle").length;
  const inFlight = loads.filter((l) => IN_FLIGHT.includes(l.status));
  const loadByTruck = new Map(inFlight.map((l) => [l.truckId, l]));
  const markers = list.map((t) => ({ id: t.id, lat: t.lat, lon: t.lon, label: t.code }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fleet management"
        title="Fleet"
        subtitle="Every truck, where it is right now, who is driving and how much of the day they have left."
        right={<>{updated && <span className="hidden text-xs text-bitumen-400 md:inline">Updated {fmtDateTime(updated)}</span>}<Button size="sm" icon={<RefreshCw />} onClick={refresh}>Refresh</Button></>}
      />
      <p className="text-[13px] leading-6 text-bitumen-500">
        <span className="font-semibold text-bitumen-700">Why this matters:</span> the capacity agent uses exactly this list (status, position, hours left) when it works out who can legally cover a load.
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{trucks ? `${list.length} trucks · ${moving} moving · ${idle} at depot` : "Loading…"}</CardTitle>
            <span className="text-[11px] text-bitumen-400">Positions from the last telemetry ping</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-bitumen-50 text-left text-[11px] uppercase tracking-[0.1em] text-bitumen-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Truck</th>
                  <th className="px-4 py-2 font-semibold">Driver</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Position</th>
                  <th className="px-4 py-2 font-semibold">Carrying</th>
                  <th className="px-4 py-2 text-right font-semibold">Fuel</th>
                  <th className="px-4 py-2 text-right font-semibold">Hours left today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bitumen-100">
                {trucks === null && [0, 1, 2, 3].map((i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-bitumen-100" /></td></tr>)}
                {list.map((t) => {
                  const load = loadByTruck.get(t.id);
                  const hours = hoursLeftToday(t);
                  return (
                    <tr key={t.id} className="hover:bg-bitumen-50/60">
                      <td className="px-4 py-2.5">
                        <div className="font-mono font-semibold text-bitumen-900">{t.code}</div>
                        <div className="text-[11px] text-bitumen-500">{truckType(t.grossKg)}{t.rego ? ` · ${t.rego}` : ""}</div>
                      </td>
                      <td className="px-4 py-2.5 text-bitumen-800">{t.driverName ?? <span className="text-bitumen-400">No driver</span>}</td>
                      <td className="px-4 py-2.5"><Pill tone={TRUCK_STATUS_TONE[t.status]} filled>{TRUCK_STATUS_LABEL[t.status]}</Pill></td>
                      <td className="px-4 py-2.5 text-bitumen-700">{nearestPlace(t, loads)}</td>
                      <td className="px-4 py-2.5 text-bitumen-700">
                        {load ? <><span className="font-mono text-bitumen-900">{load.ref}</span> <span className="text-bitumen-500">{shortPlace(load.originLabel)} → {shortPlace(load.destLabel)}</span></> : <span className="text-bitumen-400">Empty</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <FuelBar pct={t.fuelPct} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={hours === 0 ? "text-bitumen-400" : hours <= 4 ? "font-semibold text-amber-700" : "font-semibold text-bitumen-900"}>{hours} h</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-bitumen-100 px-4 py-2 text-[11px] leading-5 text-bitumen-400">
            Hours left follow the standard solo-driver rule the capacity agent applies: a truck already moving has about 4 h left in its shift, a rested truck at the depot has 12 h, off-duty drivers have none. Position is the distance to the nearest pickup or delivery point.
          </p>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="py-3"><CardTitle>Where the fleet is</CardTitle><span className="text-[11px] text-bitumen-400">Queensland</span></CardHeader>
          <div className="p-1.5">
            {apiKey ? (
              <HereMap apiKey={apiKey} center={{ lat: -23.5, lon: 148 }} zoom={5} height="420px" markers={markers} markerStyle="label" minimal />
            ) : (
              <div className="flex h-[420px] items-center justify-center rounded-xl bg-bitumen-50 px-6 text-center text-sm text-bitumen-500">Map key not configured.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function FuelBar({ pct }: { pct: number }) {
  const tone = pct < 25 ? "bg-status-delayed" : pct < 50 ? "bg-status-held" : "bg-gum-500";
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-bitumen-100"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>
      <span className={pct < 25 ? "font-semibold text-red-700" : "text-bitumen-800"}>{Math.round(pct)}%</span>
    </span>
  );
}
