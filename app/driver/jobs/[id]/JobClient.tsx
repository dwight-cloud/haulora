"use client";

import Link from "next/link";
import { ArrowRight, ChevronLeft, Mail, MessageSquareText, TriangleAlert } from "lucide-react";
import { Skeleton, useDriver } from "@/components/driver/DriverShell";
import { Flags, JobMap, StatusButton, fmtShort } from "@/components/driver/JobCard";
import { Pill } from "@/components/ui/primitives";
import { LOAD_STATUS_LABEL, LOAD_STATUS_TONE, shortPlace } from "@/lib/ui/fleet";
import { plainText } from "@/lib/ui/plain";

export function JobClient({ id }: { id: string }) {
  const { me, refresh } = useDriver();
  if (!me) return <Skeleton />;
  const job = me.jobs.find((j) => j.id === id);
  if (!job) {
    return (
      <div className="rounded-xl border border-bitumen-200 bg-white p-5 text-[14px] text-bitumen-700">
        That job is not on your truck any more. <Link href="/driver" className="font-semibold text-rust-600">Back to today</Link>
      </div>
    );
  }
  const km = job.currentKm ?? job.plannedKm;
  const hours = job.currentHours ?? job.plannedHours;
  const reportHref = `/driver/report?job=${encodeURIComponent(job.ref)}&road=${encodeURIComponent(guessRoad(job.originLabel, job.destLabel))}`;

  return (
    <div className="space-y-4 animate-fade-up">
      <Link href="/driver" className="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-bitumen-600"><ChevronLeft className="h-4 w-4" /> Today</Link>

      <div className="overflow-hidden rounded-2xl border border-bitumen-200 bg-white shadow-card">
        <JobMap job={job} truck={me.truck} height="280px" minimal />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-bitumen-400">{job.ref}</div>
              <h1 className="mt-0.5 text-[20px] font-bold text-bitumen-900">{job.customerName}</h1>
            </div>
            <Pill tone={LOAD_STATUS_TONE[job.status]} filled>{LOAD_STATUS_LABEL[job.status]}</Pill>
          </div>
          <Flags job={job} className="mt-2" />

          <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[14px]">
            <span className="mt-1 h-3 w-3 rounded-full border-2 border-bitumen-400 bg-white" aria-hidden />
            <div><div className="font-semibold text-bitumen-900">{shortPlace(job.originLabel)}</div><div className="text-[12px] text-bitumen-500">{job.originLabel} · pick up {fmtShort(job.pickupAt)}</div></div>
            <span className="mt-1 h-3 w-3 rounded-full bg-rust-500" aria-hidden />
            <div><div className="font-semibold text-bitumen-900">{shortPlace(job.destLabel)}</div><div className="text-[12px] text-bitumen-500">{job.destLabel} · due {fmtShort(job.dueAt)}</div></div>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat k="Load" v={`${job.tonnes} t`} />
            <Stat k="Distance" v={km ? `${Math.round(km)} km` : "—"} />
            <Stat k="Driving" v={hours ? `${hours.toFixed(1)} h` : "—"} />
          </dl>
          <div className="mt-2 text-[13px] text-bitumen-600">{job.description}</div>

          {job.replanReason && (
            <div className="mt-4 rounded-lg bg-bitumen-50 p-3 text-[13px] leading-5 text-bitumen-800">
              <div className="flex items-center gap-1.5 font-semibold text-bitumen-900"><MessageSquareText className="h-3.5 w-3.5 text-rust-500" /> Note from dispatch</div>
              <p className="mt-1">{plainText(job.replanReason)}</p>
            </div>
          )}

          <div className="mt-5"><StatusButton job={job} onChanged={refresh} size="lg" /></div>
        </div>
      </div>

      <section className="rounded-2xl border border-bitumen-200 bg-white p-4 shadow-card">
        <div className="text-[13px] font-semibold text-bitumen-900">Customer</div>
        <div className="mt-1 text-[15px] font-semibold text-bitumen-800">{job.customerName}</div>
        {job.customerEmail ? (
          <a href={`mailto:${job.customerEmail}`} className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-rust-600"><Mail className="h-4 w-4" /> {job.customerEmail}</a>
        ) : <div className="mt-1 text-[13px] text-bitumen-500">No contact listed. Call dispatch.</div>}
      </section>

      <Link href={reportHref} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-bitumen-900 px-4 text-[15px] font-semibold text-white hover:bg-bitumen-800">
        <TriangleAlert className="h-4 w-4 text-rust-300" /> Report a road problem on this trip <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-bitumen-50 px-2 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-bitumen-400">{k}</dt>
      <dd className="text-[15px] font-bold tabular-nums text-bitumen-900">{v}</dd>
    </div>
  );
}

/** Best-guess highway for the report form from the two ends of the trip. */
function guessRoad(a: string, b: string): string {
  const s = `${a} ${b}`.toLowerCase();
  if (/toowoomba|roma|dalby|chinchilla/.test(s)) return "Warrego Highway";
  if (/mount isa|cloncurry|charters towers|hughenden/.test(s)) return "Flinders Highway";
  if (/emerald|longreach|barcaldine|blackwater/.test(s)) return "Capricorn Highway";
  if (/gold coast|coolangatta|tweed|byron|lismore|grafton|coffs/.test(s)) return "Pacific Motorway";
  if (/townsville|cairns|mackay|rockhampton|gladstone|bundaberg|ingham|gympie|maryborough/.test(s)) return "Bruce Highway";
  return "";
}
