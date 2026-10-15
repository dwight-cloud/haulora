"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Button, Card, CardBody, ErrorBanner, PageHeader, Pill, type PillTone } from "@/components/ui/primitives";
import { computeLevyPct } from "@/lib/au/fuel-levy";
import type { Customer } from "@/lib/domain/types";
import { api, ApiError, fmtAud, fmtDateTime, fmtInt } from "@/lib/ui/format";
import { Term } from "@/components/Term";

interface Stats { diesel: { dieselCpl: number; region: string; capturedAt: number; source: string } | null; pendingActions: number }
const POLL_MS = 20000;
const LEVY_METHOD_LABEL: Record<Customer["levyMethod"], string> = { indexed: "Surcharge moves with diesel", fixed: "Fixed surcharge", none: "No fuel surcharge in contract" };

type LevyState = { label: string; tone: PillTone; shouldBe: number | null };

function levyState(c: Customer, dieselCpl: number | null): LevyState {
  if (c.levyMethod === "none") return { label: "No surcharge", tone: "neutral", shouldBe: null };
  if (c.levyMethod === "fixed") return { label: "Fixed", tone: "neutral", shouldBe: c.levyCurrentPct };
  if (dieselCpl == null || c.levyBaseCpl == null) return { label: "No diesel price yet", tone: "neutral", shouldBe: null };
  let shouldBe: number;
  try { shouldBe = computeLevyPct({ currentCpl: dieselCpl, baseCpl: c.levyBaseCpl, fuelShare: c.levyFuelShare, method: "indexed" }); }
  catch { return { label: "Cannot compute", tone: "neutral", shouldBe: null }; }
  const gap = Math.round((shouldBe - c.levyCurrentPct) * 10) / 10;
  if (Math.abs(gap) < 0.5) return { label: "Up to date", tone: "success", shouldBe };
  if (gap > 0) return { label: `Out of date: ${gap.toFixed(1)} points too low`, tone: "danger", shouldBe };
  return { label: `${Math.abs(gap).toFixed(1)} points too high`, tone: "warning", shouldBe };
}

export function CustomersClient() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([api<{ customers: Customer[] }>("/api/loads"), api<Stats>("/api/stats")]);
      setCustomers(l.customers); setStats(s); setError(null);
    } catch (e) { if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : "Load failed"); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [refresh]);

  const diesel = stats?.diesel?.dieselCpl ?? null;
  const list = customers ?? [];
  const under = list.filter((c) => levyState(c, diesel).tone === "danger").length;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Your fleet" title="Customers" subtitle={<>Who you carry for, what they pay per kilometre, and whether their <Term t="fuel levy" /> still matches today's diesel price.</>} right={<Button size="sm" icon={<RefreshCw />} onClick={refresh}>Refresh</Button>} />
      <p className="text-[13px] leading-6 text-bitumen-500">
        <span className="font-semibold text-bitumen-700">Why this matters:</span> every week a fuel surcharge sits below where the contract says it should be is money you are quietly giving away. The fuel AI helper suggests the change; you accept it on <Link href="/decisions" className="font-semibold text-rust-700 hover:underline">Your decisions</Link>.
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bitumen-200 bg-white px-4 py-3 text-[13px]">
        <span className="font-semibold text-bitumen-900">Diesel today:</span>
        <span className="tabular-nums">{diesel != null ? `${diesel.toFixed(1)} cents a litre` : "no price yet"}</span>
        {stats?.diesel && <span className="text-bitumen-500">· {stats.diesel.region} · {stats.diesel.source} · {fmtDateTime(stats.diesel.capturedAt)}</span>}
        {customers && <span className="ml-auto"><Pill tone={under > 0 ? "danger" : "success"} filled>{under > 0 ? `${under} customer${under === 1 ? "" : "s"} with a surcharge out of date` : "All fuel surcharges up to date"}</Pill></span>}
      </div>

      <div data-tour="levy-chips" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {customers === null && [0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl border border-bitumen-200 bg-bitumen-50" />)}
        {list.map((c) => {
          const st = levyState(c, diesel);
          const weeklyBase = c.weeklyKm * c.baseRatePerKm;
          const gapAud = st.shouldBe != null && c.levyMethod === "indexed" ? (weeklyBase * (st.shouldBe - c.levyCurrentPct)) / 100 : 0;
          return (
            <Card key={c.id} className="flex flex-col">
              <CardBody className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[15px] font-semibold leading-5 text-bitumen-900">{c.name}</div>
                    <div className="mt-0.5 text-[12px] text-bitumen-500">{LEVY_METHOD_LABEL[c.levyMethod]} · {c.levyNoticeDays} days' notice</div>
                  </div>
                  <Pill tone={st.tone} filled>{st.label}</Pill>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                  <Cell k="Price per km">{fmtAud(c.baseRatePerKm, { decimals: 2 })}/km</Cell>
                  <Cell k="Weekly km">{fmtInt(Math.round(c.weeklyKm))} km</Cell>
                  <Cell k="Diesel price the contract assumes">{c.levyBaseCpl != null ? `${c.levyBaseCpl.toFixed(1)}c a litre` : "—"}</Cell>
                  <Cell k="Fuel as a share of the cost">{c.levyMethod === "indexed" ? `${Math.round(c.levyFuelShare * 100)}%` : "—"}</Cell>
                  <Cell k="Surcharge you charge now"><span className="text-lg font-bold tabular-nums text-bitumen-900">{c.levyCurrentPct.toFixed(1)}%</span></Cell>
                  <Cell k="Surcharge should be now"><span className={`text-lg font-bold tabular-nums ${st.tone === "danger" ? "text-rust-600" : "text-bitumen-900"}`}>{st.shouldBe != null ? `${st.shouldBe.toFixed(1)}%` : "—"}</span></Cell>
                </dl>
                {Math.abs(gapAud) >= 1 && (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-[12px] leading-5 ${gapAud > 0 ? "bg-rust-50 text-rust-900" : "bg-amber-50 text-amber-900"}`}>
                    {gapAud > 0 ? `About ${fmtAud(gapAud)} a week you are not charging on this customer's ${fmtInt(Math.round(c.weeklyKm))} km.` : `About ${fmtAud(Math.abs(gapAud))} a week more than the contract allows.`}
                  </div>
                )}
                <p className="mt-auto pt-3 text-[11px] leading-5 text-bitumen-400">The fuel AI helper suggests the change; you accept it on Your decisions.</p>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="rounded-xl border border-bitumen-200 bg-white px-4 py-3 text-[12px] leading-5 text-bitumen-500">
        <span className="font-semibold text-bitumen-700">How the fuel surcharge is worked out.</span> When the contract says the surcharge moves with diesel: surcharge % = (diesel today − the diesel price the contract assumes) ÷ that price × fuel's share of the cost × 100, never below zero. "Up to date" means what you charge is within half a point of that number.
        <Link href="/agents" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-bitumen-700 hover:text-bitumen-900">See the fuel AI helper <ArrowUpRight className="h-3 w-3" /></Link>
      </div>
    </div>
  );
}

function Cell({ k, children }: { k: string; children: React.ReactNode }) {
  return <div><dt className="text-[11px] uppercase tracking-[0.1em] text-bitumen-500">{k}</dt><dd className="mt-0.5 text-bitumen-800">{children}</dd></div>;
}
