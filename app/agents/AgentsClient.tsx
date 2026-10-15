"use client";

import { useCallback, useEffect, useState } from "react";
import { Fuel, Loader2, Play, ShieldCheck, TriangleAlert, Users, X } from "lucide-react";
import { AgentTrace } from "@/components/AgentTrace";
import { Button, Card, CardBody, CardHeader, CardTitle, PageHeader, Pill } from "@/components/ui/primitives";
import type { AgentName, AgentRun, AgentStep } from "@/lib/domain/types";
import { api, ApiError, fmtDateTime, fmtDuration, fmtInt, fmtUsd } from "@/lib/ui/format";

interface Stats { caps: { maxSteps: number; maxRunCostUsd: number; dailySpendCapUsd: number }; model: string; mock: boolean; spend24hUsd: number }

/** Static description of each agent: mirrors lib/agents/{fuel,disruption,capacity}.ts. */
const AGENTS: Array<{
  id: AgentName; name: string; icon: React.ReactNode; status: string; statusTone: "success" | "neutral";
  trigger: string; decision: string; action: string; metric: string;
  tools: Array<{ name: string; risk: "read" | "propose"; what: string }>;
  rules: string[]; caps: string;
}> = [
  {
    id: "fuel", name: "Fuel agent", icon: <Fuel />, status: "Live model", statusTone: "success",
    trigger: "diesel price moves (ACCC weekly, feed, or scenario)",
    decision: "what each customer's levy should be",
    action: "proposes rate-card updates with the notice drafted",
    metric: "A$ recovered per week",
    tools: [
      { name: "get_latest_diesel_price", risk: "read", what: "Latest observed retail diesel c/L with the previous observation" },
      { name: "get_price_history", risk: "read", what: "Recent price observations, newest first" },
      { name: "list_customer_contracts", risk: "read", what: "Contract terms: base rate, levy method, reference price, fuel share, weekly km, notice days" },
      { name: "compute_levy", risk: "read", what: "Deterministic levy engine: implied %, change in points, weekly A$ effect, risk tier" },
      { name: "trip_fuel_cost", risk: "read", what: "Litres and A$ for a trip" },
      { name: "propose_rate_card_update", risk: "propose", what: "Queue a levy change with the customer notice drafted; never applied directly" },
      { name: "flag_for_review", risk: "propose", what: "Raise a contract or price anomaly for a human" },
    ],
    rules: [
      "For every customer, call compute_levy at the latest price. Never estimate a levy in your head; the engine is the source of truth.",
      "Propose a rate-card update only when exceedsThreshold is true (a change of at least 0.5 percentage points). Set the effective date to today plus the contract's notice days.",
      "Customers on method \"none\" or \"fixed\" get no levy proposal. If a fixed levy looks badly out of line with the indexed result (more than 5 points), flag it for review instead.",
      "If a contract is missing its reference price, flag it for review.",
      "Rate card changes always wait for a human, whatever the size.",
    ],
    caps: "16 steps",
  },
  {
    id: "disruption", name: "Disruption agent", icon: <TriangleAlert />, status: "Live model", statusTone: "success",
    trigger: "road or weather event (state traffic feed, BoM warning, or scenario)",
    decision: "reroute, hold, proceed or escalate per load",
    action: "proposes truck-legal detours and holds",
    metric: "cargo value protected, hours saved",
    tools: [
      { name: "list_active_disruptions", risk: "read", what: "Active events of moderate severity or worse" },
      { name: "find_affected_loads", risk: "read", what: "In-flight loads whose route passes through an event, with due time, value and flags" },
      { name: "weather_along_route", risk: "read", what: "Live Open-Meteo samples along a load's route" },
      { name: "plan_detour", risk: "read", what: "HERE truck route avoiding every active event, using the truck's height and mass" },
      { name: "propose_replan", risk: "propose", what: "Switch the load to the planned detour (medium; high if +3 h or >A$100k)" },
      { name: "propose_hold", risk: "propose", what: "Hold the load at origin until the event clears" },
      { name: "escalate", risk: "propose", what: "Hand the load to a human with the choice stated" },
      { name: "draft_customer_notice", risk: "propose", what: "Log a delay or re-route notice for the dispatcher to send (low risk)" },
    ],
    rules: [
      "proceed: nearest point of the route is outside the event radius, or severity is minor.",
      "escalate: a critical event with the truck already en route inside the zone.",
      "reroute: a detour exists and still meets the load's due time.",
      "escalate: essential or perishable freight that would miss its due time.",
      "hold: no detour, or the detour misses the due time, and the load is not essential or perishable.",
      "Do not invent road names or hours; use tool outputs.",
    ],
    caps: "24 steps · US$0.50 per run",
  },
  {
    id: "capacity", name: "Capacity agent", icon: <Users />, status: "Phase 2 design, rules only", statusTone: "neutral",
    trigger: "driver or truck unavailable, or a load with no truck",
    decision: "which idle truck can legally cover",
    action: "proposes reassignments or escalates",
    metric: "loads covered per driver-day",
    tools: [
      { name: "list_fleet_availability", risk: "read", what: "Every truck with status, position, profile and legal hours left today" },
      { name: "list_uncovered_loads", risk: "read", what: "Loads with no truck, or whose truck is off duty or out of service" },
      { name: "fatigue_check", risk: "read", what: "Is the trip legal today under HVNL standard hours? Breaks required and why" },
      { name: "propose_reassignment", risk: "propose", what: "Move a load onto another truck, with the empty km stated (medium)" },
      { name: "escalate_uncovered", risk: "propose", what: "No legal cover today: subcontract, two-up, or next-day (high)" },
    ],
    rules: [
      "HVNL standard hours for a solo driver: 12 h work in any 24 h, 7 h continuous rest, a 15 min break after 5.5 h.",
      "Essential and perishable loads are covered first, then earliest pickup.",
      "Candidates are idle trucks of at least 22.5 t gross, nearest to the pickup first; empty km count toward the shift at 80 km/h.",
      "A load with no legal cover is escalated with the options stated; the agent never guesses.",
      "No model is called in this POC. The tool surface is the one Phase 2 would expose to a model.",
    ],
    caps: "30 steps · no model cost",
  },
];

export function AgentsClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [running, setRunning] = useState<AgentName | null>(null);
  const [open, setOpen] = useState<{ run: AgentRun; steps: AgentStep[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api<Stats>("/api/stats"), api<{ runs: AgentRun[] }>("/api/agents/runs?limit=30")]);
      setStats(s); setRuns(r.runs);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function runNow(agent: AgentName) {
    if (running) return;
    setRunning(agent); setError(null);
    try {
      const r = await api<{ run: AgentRun; steps: AgentStep[] }>("/api/agents/run", { method: "POST", body: JSON.stringify({ agent }) });
      setOpen(r);
    } catch (e) { setError(e instanceof Error ? e.message : "Run failed"); }
    finally { setRunning(null); refresh(); }
  }

  async function openRun(id: string) {
    try { setOpen(await api<{ run: AgentRun; steps: AgentStep[] }>(`/api/agents/runs/${id}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Load failed"); }
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Copilot" title="Agents" subtitle={stats ? <>Model <span className="font-mono">{stats.model}</span>{stats.mock ? " · scripted plans (no API key configured)" : ""}</> : "loading…"} />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-3">
        {AGENTS.map((a) => (
          <Card key={a.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-white [&>svg]:h-4 [&>svg]:w-4">{a.icon}</span>
                <CardTitle>{a.name}</CardTitle>
              </div>
              <Pill tone={a.statusTone}>{a.status}</Pill>
            </CardHeader>
            <CardBody className="flex flex-1 flex-col gap-4">
              <dl className="space-y-1.5 text-[13px]">
                <Row k="Trigger" v={a.trigger} />
                <Row k="Decision" v={a.decision} />
                <Row k="Action" v={a.action} />
                <Row k="Metric" v={a.metric} />
              </dl>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">Tools</div>
                <ul className="mt-1.5 space-y-1">
                  {a.tools.map((t) => (
                    <li key={t.name} className="flex items-start gap-2 text-xs">
                      <code className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-800">{t.name}</code>
                      <Pill tone={t.risk === "propose" ? "warning" : "info"}>{t.risk}</Pill>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">Decision rules</div>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-5 text-ink-700">
                  {a.rules.map((r, i) => <li key={i}>{r}</li>)}
                </ol>
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="text-[11px] text-ink-400">Caps: {a.caps}</span>
                <Button
                  tone="primary" size="sm"
                  disabled={!!running}
                  onClick={() => runNow(a.id)}
                  icon={running === a.id ? <Loader2 className="animate-spin" /> : <Play />}
                >
                  {running === a.id ? "Running…" : "Run now"}
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Governance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ink-500" /><CardTitle>How a run is governed</CardTitle></div>
        </CardHeader>
        <CardBody className="grid gap-4 text-[13px] leading-6 text-ink-700 md:grid-cols-3">
          <div>
            <div className="font-semibold text-ink-900">Tools are read or propose only</div>
            There is no "execute" rating. An agent can look and it can propose; the executor is the only code that changes a rate card, a route or a status, and it runs deterministic logic per action kind.
          </div>
          <div>
            <div className="font-semibold text-ink-900">Hard caps, enforced in the runtime</div>
            <ul className="mt-1 space-y-0.5">
              <li>Step cap: <b>{stats?.caps.maxSteps ?? "…"}</b> tool calls per run (agents may set lower)</li>
              <li>Per-run cost cap: <b>{stats ? fmtUsd(stats.caps.maxRunCostUsd, 2) : "…"}</b></li>
              <li>24h spend cap: <b>{stats ? fmtUsd(stats.caps.dailySpendCapUsd, 2) : "…"}</b> (spent {stats ? fmtUsd(stats.spend24hUsd, 3) : "…"})</li>
              <li>Tool arguments are schema-checked; a bad call is logged as a guardrail and the model is told why.</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-ink-900">Who decides</div>
            Low-risk actions auto-execute at proposal time (customer notices, flags for review). Everything else, including every rate-card change, re-route, hold and reassignment, waits for a dispatcher in the approval queue.
          </div>
        </CardBody>
      </Card>

      {/* Runs */}
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Runs</CardTitle><span className="text-[11px] text-ink-400">{runs.length} most recent · click to open the trace</span></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink-100 bg-ink-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left">Time</th>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Trigger</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Tools</th>
                <th className="px-4 py-2 text-right">Tokens</th>
                <th className="px-4 py-2 text-right">Cost</th>
                <th className="px-4 py-2 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {runs.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-ink-400">No runs yet.</td></tr>}
              {runs.map((r) => (
                <tr key={r.id} onClick={() => openRun(r.id)} className="cursor-pointer hover:bg-ink-50">
                  <td className="whitespace-nowrap px-4 py-2 text-ink-600">{fmtDateTime(r.startedAt)}</td>
                  <td className="px-4 py-2 font-medium text-ink-900">{r.agent}</td>
                  <td className="max-w-[280px] truncate px-4 py-2 text-ink-600" title={r.trigger}>{r.trigger}</td>
                  <td className="px-4 py-2"><Pill tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "warning"}>{r.status.replace("_", " ")}</Pill></td>
                  <td className="px-4 py-2 text-right font-mono">{r.toolCalls}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtInt(r.inputTokens + r.outputTokens)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtUsd(r.costUsd)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtDuration(r.finishedAt ? r.finishedAt - r.startedAt : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Trace drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-card-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">Run trace · <span className="font-mono normal-case tracking-normal">{open.run.id}</span></div>
              <Button size="sm" icon={<X />} onClick={() => setOpen(null)}>Close</Button>
            </div>
            <AgentTrace run={open.run} steps={open.steps} />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-2">
      <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">{k}</dt>
      <dd className="text-ink-700">{v}</dd>
    </div>
  );
}
