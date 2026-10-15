"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle, PageHeader, Pill, Stat } from "@/components/ui/primitives";
import { api, ApiError, fmtDateTime, fmtDuration, fmtInt, fmtUsd } from "@/lib/ui/format";

interface EvalCase { id?: string; name?: string; passed?: boolean; pass?: boolean; ok?: boolean; expected?: unknown; actual?: unknown; notes?: string; reason?: string; error?: string; [k: string]: unknown }
interface Suite { suite: string; model: string; total: number; passed: number; cost_usd: number; p95_ms: number | null; created_at: number; report: { cases?: EvalCase[] } | EvalCase[] }
interface Stats { runs: number; totalCostUsd: number; totalTokens: number; model: string; mock: boolean; spend24hUsd: number; caps: { dailySpendCapUsd: number } }

const casePassed = (c: EvalCase) => c.passed ?? c.pass ?? c.ok ?? false;
const str = (v: unknown) => (v == null ? "—" : typeof v === "string" ? v : JSON.stringify(v));

export function EvalsClient() {
  const [suites, setSuites] = useState<Suite[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ suites: Suite[] }>("/api/evals").then((d) => setSuites(d.suites ?? [])).catch((e) => { setSuites([]); if (!(e instanceof ApiError && e.status === 401)) setError(e.message); });
    api<Stats>("/api/stats").then(setStats).catch(() => {});
  }, []);

  const avgCost = stats && stats.runs > 0 ? stats.totalCostUsd / stats.runs : null;
  const avgTokens = stats && stats.runs > 0 ? stats.totalTokens / stats.runs : null;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Copilot" title="Evals & cost" subtitle="Decision-rule evals per agent, and what each run costs" />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {/* Cost per run */}
      <Card>
        <CardHeader><CardTitle>Cost per run</CardTitle><span className="font-mono text-[11px] text-ink-400">{stats?.model}</span></CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Agent runs" value={stats ? fmtInt(stats.runs) : "—"} sub="all time" />
            <Stat label="Avg cost / run" value={avgCost != null ? fmtUsd(avgCost) : "—"} sub={stats ? `${fmtUsd(stats.totalCostUsd, 3)} total` : undefined} />
            <Stat label="Avg tokens / run" value={avgTokens != null ? fmtInt(Math.round(avgTokens)) : "—"} sub="in + out" />
            <Stat label="24h spend" value={stats ? fmtUsd(stats.spend24hUsd, 3) : "—"} sub={stats ? `cap ${fmtUsd(stats.caps.dailySpendCapUsd, 2)}` : undefined} />
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Pricing assumption: US$0.25 / US$2.00 per 1M tokens in/out for gpt-5.4-mini; override via env. Tokens are priced per call from the model's usage report, so the meter is exact for live runs; scripted runs cost nothing.
          </p>
        </CardBody>
      </Card>

      {/* Suites */}
      {suites === null ? (
        <Card><CardBody className="text-sm text-ink-400">Loading…</CardBody></Card>
      ) : suites.length === 0 ? (
        <Card><CardBody className="py-10 text-center text-sm text-ink-500">
          No eval results yet. Run <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-800">npm run eval</code> to populate.
        </CardBody></Card>
      ) : suites.map((s) => {
        const cases: EvalCase[] = Array.isArray(s.report) ? s.report : s.report?.cases ?? [];
        const failed = cases.filter((c) => !casePassed(c));
        const rate = s.total > 0 ? (s.passed / s.total) * 100 : 0;
        return (
          <Card key={s.suite} className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{s.suite.replace(/_/g, " ")}</CardTitle>
                <Pill tone={rate === 100 ? "success" : rate >= 80 ? "warning" : "danger"}>{rate.toFixed(0)}% pass</Pill>
              </div>
              <span className="text-[11px] text-ink-400">{fmtDateTime(s.created_at)}</span>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Cases" value={s.total} />
                <Stat label="Passed" value={s.passed} tone={s.passed === s.total ? "success" : "warning"} />
                <Stat label="Model" value={<span className="break-all font-mono text-[13px] leading-5">{s.model}</span>} />
                <Stat label="p95 latency" value={fmtDuration(s.p95_ms)} />
                <Stat label="Cost" value={fmtUsd(s.cost_usd)} />
              </div>
              {failed.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-lg border border-ink-200">
                  <table className="w-full text-[13px]">
                    <thead className="border-b border-ink-100 bg-ink-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                      <tr><th className="px-3 py-2 text-left">Failed case</th><th className="px-3 py-2 text-left">Expected</th><th className="px-3 py-2 text-left">Actual</th><th className="px-3 py-2 text-left">Notes</th></tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {failed.map((c, i) => (
                        <tr key={c.id ?? i}>
                          <td className="px-3 py-2 font-mono text-[12px] text-ink-800">{c.id ?? c.name ?? `#${i + 1}`}</td>
                          <td className="px-3 py-2 font-mono text-[12px] text-emerald-800">{str(c.expected)}</td>
                          <td className="px-3 py-2 font-mono text-[12px] text-red-700">{str(c.actual)}</td>
                          <td className="px-3 py-2 text-ink-600">{c.notes ?? c.reason ?? c.error ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 text-xs text-ink-500">All {s.total} cases passed.</div>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
