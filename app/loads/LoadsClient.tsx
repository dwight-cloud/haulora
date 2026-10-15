"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { HereMap } from "@/components/HereMap";
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorBanner, PageHeader, Pill, cx } from "@/components/ui/primitives";
import type { Customer, Load, LoadStatus, Truck } from "@/lib/domain/types";
import { api, ApiError, fmtAud, fmtDateTime } from "@/lib/ui/format";
import { IN_FLIGHT, LOAD_STATUS_COLOUR, LOAD_STATUS_LABEL, LOAD_STATUS_TONE, shortPlace } from "@/lib/ui/fleet";

const POLL_MS = 15000;
type Filter = "all" | "in_flight" | LoadStatus;
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "in_flight", label: "On the road" }, { id: "all", label: "All" }, { id: "planned", label: "Planned" }, { id: "en_route", label: "En route" },
  { id: "delayed", label: "Delayed" }, { id: "rerouted", label: "Rerouted" }, { id: "held", label: "Held" }, { id: "delivered", label: "Delivered" },
];

export function LoadsClient({ apiKey }: { apiKey: string }) {
  const [loads, setLoads] = useState<Load[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [filter, setFilter] = useState<Filter>("in_flight");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ loads: Load[]; customers: Customer[]; trucks: Truck[] }>("/api/loads");
      setLoads(d.loads); setCustomers(d.customers); setTrucks(d.trucks); setError(null);
    } catch (e) { if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : "Load failed"); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const all = loads ?? [];
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const truckCode = (id: string | null) => trucks.find((t) => t.id === id)?.code ?? "Unassigned";
  const visible = all
    .filter((l) => filter === "all" ? true : filter === "in_flight" ? IN_FLIGHT.includes(l.status) : l.status === filter)
    .sort((a, b) => a.dueAt - b.dueAt);
  const counts = (f: Filter) => all.filter((l) => f === "all" ? true : f === "in_flight" ? IN_FLIGHT.includes(l.status) : l.status === f).length;
  const sel = all.find((l) => l.id === selected) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Fleet management" title="Loads" subtitle="Every consignment you are carrying: who it is for, where it is going, when it is due and whether it is on track." right={<Button size="sm" icon={<RefreshCw />} onClick={refresh}>Refresh</Button>} />
      <p className="text-[13px] leading-6 text-bitumen-500">
        <span className="font-semibold text-bitumen-700">Why this matters:</span> when a road closes, the disruption agent checks each of these routes and proposes a detour, a hold or a phone call per load. Click a row to see its route.
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter loads by status">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
            className={cx("inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition", filter === f.id ? "border-bitumen-900 bg-bitumen-900 text-white" : "border-bitumen-200 bg-white text-bitumen-600 hover:bg-bitumen-50")}>
            {f.label} <span className={cx("rounded-full px-1.5 text-[11px] tabular-nums", filter === f.id ? "bg-white/15" : "bg-bitumen-100 text-bitumen-500")}>{counts(f.id)}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="bg-bitumen-50 text-left text-[11px] uppercase tracking-[0.1em] text-bitumen-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Ref</th>
                <th className="px-4 py-2 font-semibold">Customer</th>
                <th className="px-4 py-2 font-semibold">From → To</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Due</th>
                <th className="px-4 py-2 text-right font-semibold">Tonnes</th>
                <th className="px-4 py-2 text-right font-semibold">Value</th>
                <th className="px-4 py-2 font-semibold">Flags</th>
                <th className="px-4 py-2 font-semibold">Truck</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bitumen-100">
              {loads === null && [0, 1, 2, 3, 4].map((i) => <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-bitumen-100" /></td></tr>)}
              {visible.map((l) => (
                <tr key={l.id} onClick={() => setSelected(l.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSelected(l.id); }}
                  className={cx("cursor-pointer transition hover:bg-bitumen-50/70", selected === l.id && "bg-rust-50/60")}>
                  <td className="px-4 py-2.5"><div className="font-mono font-semibold text-bitumen-900">{l.ref}</div><div className="max-w-[180px] truncate text-[11px] text-bitumen-500">{l.description}</div></td>
                  <td className="px-4 py-2.5 text-bitumen-800">{customerName(l.customerId)}</td>
                  <td className="px-4 py-2.5 text-bitumen-700">{shortPlace(l.originLabel)} → {shortPlace(l.destLabel)}</td>
                  <td className="px-4 py-2.5">
                    <Pill tone={LOAD_STATUS_TONE[l.status]} filled>{LOAD_STATUS_LABEL[l.status]}</Pill>
                    {l.replanReason && <div className="mt-1 max-w-[220px] truncate text-[11px] text-bitumen-500" title={l.replanReason}>{l.replanReason}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-bitumen-700">{fmtDateTime(l.dueAt)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-bitumen-800">{l.tonnes.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-bitumen-800">{fmtAud(l.valueAud)}</td>
                  <td className="px-4 py-2.5"><div className="flex gap-1">{l.essential && <Pill tone="accent">Essential</Pill>}{l.perishable && <Pill tone="warning">Perishable</Pill>}</div></td>
                  <td className="px-4 py-2.5 font-mono text-bitumen-700">{truckCode(l.truckId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loads !== null && visible.length === 0 && <EmptyState title="No loads match this filter" body="Try 'All' to see everything, including delivered loads." />}
      </Card>

      {/* Side panel */}
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Load ${sel.ref}`}>
          <button type="button" aria-label="Close" className="absolute inset-0 bg-bitumen-900/40" onClick={() => setSelected(null)} />
          <div className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-white shadow-card-lg animate-fade-up">
            <div className="flex items-start justify-between gap-3 border-b border-bitumen-100 px-5 py-4">
              <div>
                <div className="font-mono text-lg font-bold text-bitumen-900">{sel.ref}</div>
                <div className="text-[13px] text-bitumen-500">{customerName(sel.customerId)} · {sel.description}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close panel" className="inline-flex h-10 w-10 items-center justify-center rounded-md text-bitumen-500 hover:bg-bitumen-50 hover:text-bitumen-900"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-2">
              {apiKey && (sel.currentPolyline ?? sel.plannedPolyline) ? (
                <HereMap apiKey={apiKey} height="300px" polyline={sel.currentPolyline ?? sel.plannedPolyline ?? undefined}
                  markers={[{ id: "o", lat: sel.originLat, lon: sel.originLon, label: "Pickup" }, { id: "d", lat: sel.destLat, lon: sel.destLon, label: "Delivery" }]} markerStyle="label" minimal />
              ) : (
                <div className="flex h-[300px] items-center justify-center rounded-xl bg-bitumen-50 px-6 text-center text-sm text-bitumen-500">{apiKey ? "No route has been planned for this load yet." : "Map key not configured."}</div>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-[13px]">
              <Row k="Status"><Pill tone={LOAD_STATUS_TONE[sel.status]} filled>{LOAD_STATUS_LABEL[sel.status]}</Pill></Row>
              <Row k="Truck">{truckCode(sel.truckId)}</Row>
              <Row k="Pickup">{shortPlace(sel.originLabel)}<div className="text-bitumen-500">{fmtDateTime(sel.pickupAt)}</div></Row>
              <Row k="Delivery">{shortPlace(sel.destLabel)}<div className="text-bitumen-500">due {fmtDateTime(sel.dueAt)}</div></Row>
              <Row k="Planned route">{sel.plannedKm ? `${Math.round(sel.plannedKm)} km · ${sel.plannedHours?.toFixed(1)} h` : "not planned"}</Row>
              <Row k="Current route">{sel.currentKm ? `${Math.round(sel.currentKm)} km · ${sel.currentHours?.toFixed(1)} h` : "same as planned"}</Row>
              <Row k="Cargo">{sel.tonnes.toFixed(1)} t · {fmtAud(sel.valueAud)}</Row>
              <Row k="Flags">{sel.essential || sel.perishable ? [sel.essential && "Essential", sel.perishable && "Perishable"].filter(Boolean).join(", ") : "none"}</Row>
              {sel.replanReason && <div className="col-span-2 rounded-lg bg-bitumen-50 px-3 py-2"><dt className="text-[11px] uppercase tracking-[0.1em] text-bitumen-500">Why it changed</dt><dd className="mt-0.5 text-bitumen-800">{sel.replanReason}</dd></div>}
            </dl>
            <div className="mt-auto border-t border-bitumen-100 px-5 py-3 text-[12px] leading-5 text-bitumen-500">
              Route colour on the map: <span className="inline-block h-1.5 w-4 rounded align-middle" style={{ background: LOAD_STATUS_COLOUR[sel.status] }} /> {LOAD_STATUS_LABEL[sel.status]}. Changes to this load are proposed by the agents and applied only after you approve them on Decisions.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div><dt className="text-[11px] uppercase tracking-[0.1em] text-bitumen-500">{k}</dt><dd className="mt-0.5 text-bitumen-800">{children}</dd></div>;
}
