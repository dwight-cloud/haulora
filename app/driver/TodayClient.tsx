"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Inbox, Radio, TriangleAlert } from "lucide-react";
import { Skeleton, firstName, useDriver } from "@/components/driver/DriverShell";
import { JobCard } from "@/components/driver/JobCard";
import { ShareLocation } from "@/components/driver/ShareLocation";
import { api } from "@/lib/ui/format";
import type { DriverUpdate } from "@/lib/domain/driver";

const POLL_MS = 15_000;

export function TodayClient() {
  const { me, refresh } = useDriver();
  const [updates, setUpdates] = useState<DriverUpdate[] | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => api<{ updates: DriverUpdate[] }>("/api/driver/updates").then((d) => { if (alive) setUpdates(d.updates); }).catch(() => {});
    tick();
    const id = setInterval(() => { tick(); refresh(); }, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [refresh]);

  if (!me) return <Skeleton />;
  const onChanged = () => { refresh(); };

  return (
    <div className="space-y-5 animate-fade-up">
      <section>
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-rust-600">Today</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-bitumen-900">G'day {firstName(me.user.name)}.</h1>
        <p className="mt-0.5 text-[14px] text-bitumen-500">
          You are in <span className="font-semibold text-bitumen-800">{me.truck.code}</span>
          {me.jobs.length > 0 ? <> with {me.jobs.length} delivery {me.jobs.length === 1 ? "job" : "jobs"}.</> : "."}
        </p>
      </section>

      <section aria-label="Updates from dispatch" className="rounded-2xl border border-bitumen-200 bg-white p-4 shadow-card">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-bitumen-900">
          <Radio className="h-4 w-4 text-gum-600" /> Updates from dispatch
        </div>
        {updates === null ? (
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-bitumen-100" />
        ) : updates.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-bitumen-500">Nothing new. Your jobs are as booked.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {updates.map((u) => (
              <li key={u.id} className={`rounded-lg px-3 py-2 text-[13px] leading-5 ${u.decided ? "bg-gum-50 text-gum-900" : "bg-amber-50 text-amber-900"}`}>
                {u.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {me.jobs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-bitumen-300 bg-white p-6 text-center">
          <Inbox className="mx-auto h-8 w-8 text-bitumen-300" />
          <h2 className="mt-2 text-[16px] font-bold text-bitumen-900">No delivery jobs on {me.truck.code} today</h2>
          <p className="mt-1 text-[13px] text-bitumen-500">Put the kettle on, or check you are in the right truck.</p>
          <Link href="/driver/truck" className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-bitumen-900 px-4 text-[14px] font-semibold text-white">Switch truck</Link>
        </section>
      ) : (
        <section className="space-y-4" aria-label="Your delivery jobs">
          {me.jobs.map((j) => <JobCard key={j.id} job={j} truck={me.truck} onChanged={onChanged} />)}
        </section>
      )}

      <section className="space-y-2">
        <ShareLocation onShared={refresh} />
        <Link href="/driver/report" className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-bitumen-900 px-4 text-[15px] font-semibold text-white transition hover:bg-bitumen-800">
          <TriangleAlert className="h-4 w-4 text-rust-300" /> Report a road problem
        </Link>
      </section>
    </div>
  );
}
