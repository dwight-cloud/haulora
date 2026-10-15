"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, MapPin, Navigation, Snowflake, Zap } from "lucide-react";
import { HereMap } from "@/components/HereMap";
import { Pill, cx } from "@/components/ui/primitives";
import { LOAD_STATUS_COLOUR, LOAD_STATUS_LABEL, LOAD_STATUS_TONE, shortPlace } from "@/lib/ui/fleet";
import { api, fmtDateTime } from "@/lib/ui/format";
import type { DriverJob } from "@/lib/domain/driver";
import type { Truck } from "@/lib/domain/types";

export const HERE_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY ?? "";

/** "Thu 15 Oct, 14:05" in Brisbane time, short enough for a card. */
export function fmtShort(ms: number): string {
  return fmtDateTime(ms).replace(/ \d{4},/, ",").replace(" AEST", "");
}

/** The one button that fits the job's status. */
export function StatusButton({ job, onChanged, size = "md" }: { job: DriverJob; onChanged: () => void; size?: "md" | "lg" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = job.status === "planned" ? "en_route" : ["en_route", "rerouted", "delayed"].includes(job.status) ? "delivered" : null;
  if (job.status === "held") {
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-900">
        Waiting at the depot: dispatch will tell you when to go.
      </div>
    );
  }
  if (!next) return null;
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/api/driver/jobs/${job.id}/status`, { method: "POST", body: JSON.stringify({ status: next }) });
      onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not update"); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={cx(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl font-bold text-white transition active:scale-[0.99] disabled:opacity-60",
          next === "en_route" ? "bg-rust-500 hover:bg-rust-600 shadow-glow" : "bg-gum-600 hover:bg-gum-700",
          size === "lg" ? "h-14 text-[17px]" : "h-12 text-[15px]",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : next === "en_route" ? <Navigation className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {next === "en_route" ? "Start trip" : "Delivered"}
      </button>
      {err && <div role="alert" className="mt-1.5 text-[12px] text-red-700">{err}</div>}
    </div>
  );
}

export function Flags({ job, className }: { job: DriverJob; className?: string }) {
  if (!job.essential && !job.perishable) return null;
  return (
    <div className={cx("flex flex-wrap gap-1.5", className)}>
      {job.essential && <span className="inline-flex items-center gap-1 rounded-md bg-rust-50 px-2 py-0.5 text-[11px] font-semibold text-rust-700"><Zap className="h-3 w-3" /> Urgent goods</span>}
      {job.perishable && <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800"><Snowflake className="h-3 w-3" /> Goods that spoil</span>}
    </div>
  );
}

export function JobMap({ job, truck, height = "160px", minimal = true }: { job: DriverJob; truck?: Truck | null; height?: string; minimal?: boolean }) {
  const polyline = job.currentPolyline ?? job.plannedPolyline;
  if (!HERE_KEY) return <div style={{ height }} className="flex items-center justify-center rounded-xl bg-bitumen-100 text-[12px] text-bitumen-500">Map needs a HERE key</div>;
  const markers = [
    { id: "o", lat: job.originLat, lon: job.originLon, label: "Pickup" },
    { id: "d", lat: job.destLat, lon: job.destLon, label: "Deliver" },
    ...(truck ? [{ id: "t", lat: truck.lat, lon: truck.lon, label: truck.code }] : []),
  ];
  return (
    <HereMap
      apiKey={HERE_KEY}
      center={{ lat: (job.originLat + job.destLat) / 2, lon: (job.originLon + job.destLon) / 2 }}
      zoom={6}
      markers={markers}
      markerStyle="label"
      routes={polyline ? [{ polyline, color: LOAD_STATUS_COLOUR[job.status], label: job.ref }] : []}
      fitToRoutes
      minimal={minimal}
      height={height}
    />
  );
}

export function JobCard({ job, truck, onChanged }: { job: DriverJob; truck: Truck; onChanged: () => void }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-bitumen-200 bg-white shadow-card">
      <Link href={`/driver/jobs/${job.id}`} className="block">
        <JobMap job={job} truck={truck} />
      </Link>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-bitumen-400">{job.ref}</div>
            <h2 className="mt-0.5 truncate text-[17px] font-bold text-bitumen-900">{job.customerName}</h2>
          </div>
          <Pill tone={LOAD_STATUS_TONE[job.status]} filled>{LOAD_STATUS_LABEL[job.status]}</Pill>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-bitumen-800">
          <MapPin className="h-4 w-4 shrink-0 text-bitumen-400" />
          <span className="truncate">{shortPlace(job.originLabel)}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-rust-500" />
          <span className="truncate">{shortPlace(job.destLabel)}</span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-bitumen-500">Pick up</dt><dd className="text-right font-medium tabular-nums text-bitumen-900">{fmtShort(job.pickupAt)}</dd>
          <dt className="text-bitumen-500">Due</dt><dd className="text-right font-medium tabular-nums text-bitumen-900">{fmtShort(job.dueAt)}</dd>
          <dt className="text-bitumen-500">Load</dt><dd className="text-right font-medium tabular-nums text-bitumen-900">{job.tonnes} t · {job.description}</dd>
        </dl>
        <Flags job={job} className="mt-3" />

        <div className="mt-4">
          <StatusButton job={job} onChanged={onChanged} />
        </div>
        <Link href={`/driver/jobs/${job.id}`} className="mt-3 inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-bitumen-600 hover:text-rust-600">
          Job details <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
