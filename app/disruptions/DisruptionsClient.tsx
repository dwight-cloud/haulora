"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { HereMap } from "@/components/HereMap";
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorBanner, PageHeader, Pill, type PillTone } from "@/components/ui/primitives";
import type { Load, RoadEvent, Severity } from "@/lib/domain/types";
import { api, ApiError, fmtDateTime } from "@/lib/ui/format";
import { IN_FLIGHT, LOAD_STATUS_COLOUR, LOAD_STATUS_LABEL, LOAD_STATUS_TONE, shortPlace } from "@/lib/ui/fleet";

const POLL_MS = 15000;
const SEVERITY_TONE: Record<Severity, PillTone> = { minor: "neutral", moderate: "warning", major: "danger", critical: "danger" };
const SEVERITY_RANK: Record<Severity, number> = { minor: 0, moderate: 1, major: 2, critical: 3 };
const KIND_LABEL: Record<RoadEvent["kind"], string> = { closure: "Road closed", flood: "Flooding", fire: "Bushfire", crash: "Crash", restriction: "Restriction", weather: "Weather" };

type Hit = { loadId: string; ref: string; status: string; nearestKm: number };

export function DisruptionsClient({ apiKey }: { apiKey: string }) {
  const [events, setEvents] = useState<RoadEvent[] | null>(null);
  const [affected, setAffected] = useState<Record<string, Hit[]>>({});
  const [loads, setLoads] = useState<Load[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, l] = await Promise.all([api<{ events: RoadEvent[]; affected: Record<string, Hit[]> }>("/api/disruptions"), api<{ loads: Load[] }>("/api/loads")]);
      setEvents(d.events); setAffected(d.affected); setLoads(l.loads); setError(null);
    } catch (e) { if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : "Load failed"); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [refresh]);

  const list = (events ?? []).slice().sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.startsAt - a.startsAt);
  const affectedIds = new Set(Object.values(affected).flat().map((h) => h.loadId));
  const inFlight = loads.filter((l) => IN_FLIGHT.includes(l.status));
  const routes = inFlight
    .map((l) => ({ polyline: l.currentPolyline ?? l.plannedPolyline, color: LOAD_STATUS_COLOUR[l.status], label: l.ref, width: affectedIds.has(l.id) ? 7 : 2 }))
    .filter((r): r is { polyline: string; color: string; label: string; width: number } => !!r.polyline);
  const incidents = list.map((e) => ({ lat: e.lat, lon: e.lon, type: `${KIND_LABEL[e.kind]} · ${e.severity}`, description: e.title, criticality: SEVERITY_RANK[e.severity] }));
  const totalAffected = affectedIds.size;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Fleet management" title="Disruptions" subtitle="Road closures, floods and weather that are live right now, and which of your loads they touch." right={<Button size="sm" icon={<RefreshCw />} onClick={refresh}>Refresh</Button>} />
      <p className="text-[13px] leading-6 text-bitumen-500">
        <span className="font-semibold text-bitumen-700">Why this matters:</span> a load is "affected" when its planned route passes inside the event's radius. That is the same test the disruption agent runs before it proposes a detour or a hold on <Link href="/decisions" className="font-semibold text-rust-700 hover:underline">Decisions</Link>.
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {events === null && [0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl border border-bitumen-200 bg-bitumen-50" />)}
          {events !== null && list.length === 0 && (
            <Card><EmptyState title="No active disruptions" body="Roads are clear. To see how the agent handles one, press 'A flood closes the Bruce Highway' on the Overview." action={<Link href="/dashboard#step-1-title" className="inline-flex min-h-[44px] items-center rounded-lg bg-rust-500 px-4 text-sm font-semibold text-white hover:bg-rust-600">Go to Overview</Link>} /></Card>
          )}
          {list.map((e) => {
            const hits = affected[e.id] ?? [];
            return (
              <Card key={e.id}>
                <CardBody className="p-4 md:p-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={SEVERITY_TONE[e.severity]} filled>{e.severity}</Pill>
                    <Pill tone="neutral">{KIND_LABEL[e.kind]}</Pill>
                    <Pill tone="neutral">{e.road}</Pill>
                    <span className="ml-auto text-[12px] text-bitumen-500">{hits.length} load{hits.length === 1 ? "" : "s"} affected</span>
                  </div>
                  <div className="mt-2.5 text-[15px] font-semibold leading-6 text-bitumen-900">{e.title}</div>
                  {e.description && <p className="mt-1 text-[13px] leading-6 text-bitumen-600">{e.description}</p>}
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
                    <div><dt className="text-[11px] uppercase tracking-[0.1em] text-bitumen-500">Started</dt><dd className="mt-0.5 text-bitumen-800">{fmtDateTime(e.startsAt)}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-[0.1em] text-bitumen-500">Expected clear</dt><dd className="mt-0.5 text-bitumen-800">{e.endsAt ? fmtDateTime(e.endsAt) : "Unknown"}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-[0.1em] text-bitumen-500">Area</dt><dd className="mt-0.5 text-bitumen-800">{e.radiusKm} km radius</dd></div>
                  </dl>
                  {hits.length > 0 && (
                    <ul className="mt-3 divide-y divide-bitumen-100 rounded-lg border border-bitumen-200 text-[12px]">
                      {hits.map((h) => {
                        const l = loads.find((x) => x.id === h.loadId);
                        return (
                          <li key={h.loadId} className="flex items-center justify-between gap-2 px-3 py-1.5">
                            <span className="min-w-0 truncate"><span className="font-mono font-semibold text-bitumen-900">{h.ref}</span>{l && <span className="text-bitumen-500"> {shortPlace(l.originLabel)} → {shortPlace(l.destLabel)}</span>}<span className="text-bitumen-400"> · route passes {h.nearestKm} km from the event</span></span>
                            {l && <Pill tone={LOAD_STATUS_TONE[l.status]} filled>{LOAD_STATUS_LABEL[l.status]}</Pill>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden self-start">
          <CardHeader className="py-3"><CardTitle>On the map</CardTitle><span className="text-[11px] text-bitumen-400">{totalAffected} affected route{totalAffected === 1 ? "" : "s"} drawn thicker</span></CardHeader>
          <div className="p-1.5">
            {apiKey ? (
              <HereMap apiKey={apiKey} center={{ lat: -23.5, lon: 148 }} zoom={5} height="440px" routes={routes} incidents={incidents} minimal />
            ) : (
              <div className="flex h-[440px] items-center justify-center rounded-xl bg-bitumen-50 px-6 text-center text-sm text-bitumen-500">Map key not configured.</div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-bitumen-100 px-4 py-2 text-[11px] text-bitumen-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Disruption</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded bg-bitumen-900" /> Affected route (thick)</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-bitumen-400" /> Other route</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
