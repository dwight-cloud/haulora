"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle, ErrorBanner, PageHeader, Pill, Stat } from "@/components/ui/primitives";
import { api, ApiError, fmtDateTime, fmtDuration, fmtInt, fmtUsd } from "@/lib/ui/format";
import { Term } from "@/components/Term";

interface EvalCase { id?: string; name?: string; passed?: boolean; pass?: boolean; ok?: boolean; expected?: unknown; actual?: unknown; notes?: string; reason?: string; error?: string; [k: string]: unknown }
interface Report { mode?: string; cases?: EvalCase[]; livePassed?: number | null; tokens?: { in: number; out: number } | null }
interface Suite { suite: string; model: string; total: number; passed: number; cost_usd: number; p95_ms: number | null; created_at: number; report: Report | EvalCase[] }
interface Stats { runs: number; totalCostUsd: number; totalTokens: number; model: string; mock: boolean; spend24hUsd: number; caps: { dailySpendCapUsd: number } }

const casePassed = (c: EvalCase) => c.passed ?? c.pass ?? c.ok ?? false;
const str = (v: unknown) => (v == null ? "—" : typeof v === "string" ? v : JSON.stringify(v));
const SUITE_LABEL: Record<string, { title: string; what: string }> = {
  fuel_levy: { title: "Fuel surcharge sums (fuel levy engine)", what: "Given a contract and a diesel price, does the calculator land on the right surcharge, threshold and risk tier?" },
  disruption_triage: { title: "Road problem rules (disruption triage)", what: "Given a delivery job, a road problem and a new route, does the rule set choose proceed, new route, wait or ask-you correctly?" },
};

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
      <PageHeader eyebrow="For engineers" title="Accuracy tests and cost" subtitle={<>Fixed test questions for each AI helper's decision rules (<Term t="evals" />), and <Term t="cost per run" />.</>} />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Suites */}
      {suites === null ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl border border-bitumen-200 bg-bitumen-50" />)}</div>
      ) : suites.length === 0 ? (
        <Card><CardBody className="py-10 text-center text-sm text-bitumen-500">
          No test results yet. Run <code className="rounded bg-bitumen-100 px-1.5 py-0.5 font-mono text-[12px] text-bitumen-800">npm run eval</code> to populate.
        </CardBody></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {suites.map((s) => <SuiteCard key={s.suite} s={s} />)}
        </div>
      )}

      {/* Cost per run */}
      <Card>
        <CardHeader><CardTitle>What each check costs (cost per run)</CardTitle><span className="font-mono text-[11px] text-bitumen-400">{stats?.model}</span></CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat loading={!stats} label="AI checks (runs)" value={stats ? fmtInt(stats.runs) : "—"} sub="all time" />
            <Stat loading={!stats} label="Avg cost per check" value={avgCost != null ? fmtUsd(avgCost) : "—"} sub={stats ? `${fmtUsd(stats.totalCostUsd, 3)} total` : undefined} />
            <Stat loading={!stats} label="Avg tokens per check" value={avgTokens != null ? fmtInt(Math.round(avgTokens)) : "—"} sub="in + out" />
            <Stat loading={!stats} label="24 h spend" value={stats ? fmtUsd(stats.spend24hUsd, 3) : "—"} sub={stats ? `cap ${fmtUsd(stats.caps.dailySpendCapUsd, 2)}` : undefined} tone={stats && stats.spend24hUsd > stats.caps.dailySpendCapUsd * 0.8 ? "warning" : "neutral"} />
          </div>
          <p className="mt-3 text-xs leading-5 text-bitumen-500">
            Pricing assumption: US$0.25 in / US$2.00 out per million tokens for the pinned model; override via env. Tokens are priced per call from the model's usage report, so the meter is measured for live checks. Scripted (mock) checks cost nothing.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function SuiteCard({ s }: { s: Suite }) {
  const report: Report = Array.isArray(s.report) ? { cases: s.report } : s.report ?? {};
  const cases = report.cases ?? [];
  const failed = cases.filter((c) => !casePassed(c));
  const rate = s.total > 0 ? (s.passed / s.total) * 100 : 0;
  const live = typeof report.livePassed === "number" ? report.livePassed : null;
  const liveRate = live != null && s.total > 0 ? (live / s.total) * 100 : null;
  const meta = SUITE_LABEL[s.suite] ?? { title: s.suite.replace(/_/g, " "), what: "" };

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle>{meta.title}</CardTitle>
        <span className="text-[11px] text-bitumen-400">{fmtDateTime(s.created_at)}</span>
      </CardHeader>
      <CardBody className="flex flex-1 flex-col">
        {meta.what && <p className="text-[13px] leading-5 text-bitumen-600">{meta.what}</p>}
        <div className="mt-4 flex items-end gap-3">
          <div className={`text-5xl font-extrabold tracking-tight tabular-nums ${rate === 100 ? "text-gum-600" : rate >= 80 ? "text-amber-700" : "text-red-700"}`}>{rate.toFixed(0)}%</div>
          <div className="pb-1.5">
            <div className="text-sm font-semibold text-bitumen-900">{s.passed} of {s.total} cases pass</div>
            <div className="text-xs text-bitumen-500">fixed-rule calculator (deterministic engine)</div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Bar label="Calculator" pct={rate} n={`${s.passed}/${s.total}`} colour="bg-gum-500" />
          {liveRate != null
            ? <Bar label="The AI alone" pct={liveRate} n={`${live}/${s.total}`} colour="bg-rust-400" />
            : <div className="text-[11px] text-bitumen-400">No model-alone comparison in this run (run <code className="font-mono">npm run eval:live</code>).</div>}
        </div>
        {liveRate != null && (
          <p className="mt-2 text-[12px] leading-5 text-bitumen-500">
            The calculator is the source of truth. "The AI alone" bar is the pinned model answering the same cases without the calculator, which is why the AI helpers call the calculator instead of guessing.
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Fact v={fmtDuration(s.p95_ms)} k="p95 latency" />
          <Fact v={fmtUsd(s.cost_usd)} k="cost" />
          <Fact v={report.tokens ? fmtInt(report.tokens.in + report.tokens.out) : "0"} k="tokens" />
        </div>
        <div className="mt-2 truncate font-mono text-[11px] text-bitumen-400" title={s.model}>{s.model}</div>

        {failed.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-bitumen-200">
            <table className="w-full text-[13px]">
              <thead className="border-b border-bitumen-100 bg-bitumen-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-bitumen-500">
                <tr><th className="px-3 py-2 text-left">Failed case</th><th className="px-3 py-2 text-left">Expected</th><th className="px-3 py-2 text-left">Actual</th></tr>
              </thead>
              <tbody className="divide-y divide-bitumen-100">
                {failed.map((c, i) => (
                  <tr key={c.id ?? i}>
                    <td className="px-3 py-2 font-mono text-[12px] text-bitumen-800">{c.id ?? c.name ?? `#${i + 1}`}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-gum-800">{str(c.expected)}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-red-700">{str(c.actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 text-xs text-bitumen-500"><Pill tone="success" filled>All {s.total} cases passed</Pill></div>
        )}
      </CardBody>
    </Card>
  );
}

function Bar({ label, pct, n, colour }: { label: string; pct: number; n: string; colour: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr_56px] items-center gap-2 text-[12px]">
      <span className="text-bitumen-600">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-bitumen-100" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span className={`block h-full rounded-full ${colour}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </span>
      <span className="text-right font-semibold text-bitumen-800 tabular-nums">{n}</span>
    </div>
  );
}

function Fact({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-lg border border-bitumen-200 bg-bitumen-50 px-2 py-2">
      <div className="text-sm font-bold text-bitumen-900 tabular-nums">{v}</div>
      <div className="text-[11px] text-bitumen-500">{k}</div>
    </div>
  );
}
