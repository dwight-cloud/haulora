"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, Cpu, Eye, FileText,
  Lightbulb, Send, ShieldAlert, Wrench, XCircle,
} from "lucide-react";
import type { AgentRun, AgentStep, StepKind } from "@/lib/domain/types";
import { fmtDuration, fmtInt, fmtTime, fmtUsd } from "@/lib/ui/format";
import { Pill } from "@/components/ui/primitives";
import { agentName, plainText, runStatus } from "@/lib/ui/plain";

type Payload = Record<string, unknown>;
const asObj = (p: unknown): Payload => (p && typeof p === "object" && !Array.isArray(p) ? (p as Payload) : {});


/** Plain-English verb for each tool, used in the one-line step summary. */
const TOOL_VERB: Record<string, string> = {
  get_latest_diesel_price: "Checked the latest diesel price",
  get_price_history: "Pulled recent diesel prices",
  list_customer_contracts: "Read every customer contract",
  compute_levy: "Worked out the fuel surcharge (compute_levy)",
  trip_fuel_cost: "Costed a trip's fuel",
  propose_rate_card_update: "Suggested a fuel surcharge change (rate card update)",
  flag_for_review: "Asked for your call (flag for review)",
  list_active_disruptions: "Listed current road problems (disruptions)",
  find_affected_loads: "Found delivery jobs crossing the event",
  weather_along_route: "Sampled weather along the route",
  plan_detour: "Planned a new route around the problem (truck-legal detour)",
  propose_replan: "Suggested a new route (re-route)",
  propose_hold: "Suggested keeping the truck at the depot (hold)",
  escalate: "Needs your call (escalated)",
  draft_customer_notice: "Drafted a customer notice",
  list_fleet_availability: "Listed driver cover (fleet availability)",
  list_uncovered_loads: "Listed delivery jobs with no driver",
  fatigue_check: "Checked the driving-hours rules (fatigue check)",
  propose_reassignment: "Suggested a different truck (reassignment)",
  escalate_uncovered: "Needs your call: a job with no driver (escalated)",
};

/**
 * Build id → human name from everything the agent saw: customer lists,
 * affected-load lists and compute_levy results. Lets a tool call that only
 * carries `customerId` read as "for Sunstate Grocery Wholesale".
 */
function buildNames(steps: AgentStep[]): Map<string, string> {
  const names = new Map<string, string>();
  let lastCall: { name: string | null; args: Payload } | null = null;
  const learn = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(learn); return; }
    const r = o as Payload;
    const id = typeof r.id === "string" ? r.id : typeof r.loadId === "string" ? r.loadId : typeof r.customerId === "string" ? r.customerId : null;
    const label = typeof r.name === "string" ? r.name : typeof r.ref === "string" ? r.ref : typeof r.code === "string" ? r.code : null;
    if (id && label) names.set(id, label);
    if (typeof r.loadId === "string" && typeof r.ref === "string") names.set(r.loadId, r.ref);
    if (typeof r.truckId === "string" && typeof r.truckCode === "string") names.set(r.truckId, r.truckCode);
  };
  for (const s of steps) {
    if (s.kind === "tool_call") { lastCall = { name: s.name, args: asObj(asObj(s.payload).args) }; continue; }
    if (s.kind === "tool_result") {
      learn(s.payload);
      const r = asObj(s.payload);
      if (lastCall && typeof r.customer === "string" && typeof lastCall.args.customerId === "string") names.set(lastCall.args.customerId, r.customer);
    }
  }
  return names;
}

function callSummary(name: string | null, args: Payload, names: Map<string, string>): string {
  const verb = (name && TOOL_VERB[name]) || `Called ${name ?? "tool"}`;
  const idKey = ["customerId", "loadId", "truckId"].find((k) => typeof args[k] === "string");
  if (idKey) {
    const id = String(args[idKey]);
    return `${verb} for ${names.get(id) ?? id}`;
  }
  const firstString = Object.values(args).find((v) => typeof v === "string") as string | undefined;
  if (firstString) return `${verb}: ${firstString.length > 90 ? firstString.slice(0, 88) + "…" : firstString}`;
  return verb;
}

export function AgentTrace({ run, steps, compact = false }: { run: AgentRun; steps: AgentStep[]; compact?: boolean }) {
  const duration = run.finishedAt ? run.finishedAt - run.startedAt : null;
  const statusTone = run.status === "completed" ? "success" : run.status === "running" ? "info" : run.status === "failed" ? "danger" : "warning";
  const toolCalls = run.toolCalls || steps.filter((s) => s.kind === "tool_call").length;
  const names = useMemo(() => buildNames(steps), [steps]);

  return (
    <div className="text-sm">
      {/* Header card */}
      <div className="rounded-xl border border-bitumen-200 bg-bitumen-50 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-bitumen-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-rust-500 text-white"><Bot className="h-4 w-4" /></span>
            {agentName(run.agent, true)} <span className="font-normal text-bitumen-400">({run.agent} agent)</span>
          </span>
          <Pill tone={statusTone} filled>{runStatus(run.status)}</Pill>
          <Pill tone={run.mock ? "neutral" : "accent"} filled>{run.mock ? "fixed script (mock)" : "live AI (model)"}</Pill>
          <span className="font-mono text-[11px] text-bitumen-500">{run.model}</span>
        </div>
        <div className="mt-1.5 truncate text-xs text-bitumen-500" title={run.trigger}>Started because (trigger): {plainText(run.trigger)}</div>
        <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-3 md:grid-cols-5"}`}>
          <Meta label="Steps (tool calls)" value={fmtInt(toolCalls)} />
          <Meta label="Tokens in" value={fmtInt(run.inputTokens)} />
          <Meta label="Tokens out" value={fmtInt(run.outputTokens)} />
          <Meta label="Cost of this check" value={fmtUsd(run.costUsd)} />
          <Meta label="Took" value={fmtDuration(duration)} />
        </div>
      </div>

      {/* Timeline */}
      <ol className="relative mt-4 ml-3 border-l-2 border-bitumen-200 pl-6">
        {steps.map((s) => <Step key={s.id} step={s} compact={compact} names={names} />)}
        {run.status === "running" && (
          <li className="relative py-2">
            <Dot className="bg-rust-500 animate-pulse" />
            <div className="text-xs text-bitumen-500">The AI helper is working…</div>
          </li>
        )}
        {steps.length === 0 && run.status !== "running" && (
          <li className="py-2 text-xs text-bitumen-500">No steps were recorded.</li>
        )}
      </ol>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bitumen-200 bg-white px-2.5 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-bitumen-400">{label}</div>
      <div className="mt-0.5 font-mono text-[12px] font-semibold text-bitumen-800 tabular-nums">{value}</div>
    </div>
  );
}

function Dot({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={`absolute -left-[15px] top-2 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white [&>svg]:h-3.5 [&>svg]:w-3.5 ${className}`}>
      {children}
    </span>
  );
}

const KIND_STYLE: Record<StepKind, { dot: string; icon: React.ReactNode; label: string }> = {
  system:      { dot: "bg-bitumen-300 text-white",      icon: <Cpu />,          label: "Set-up (system)" },
  thought:     { dot: "bg-bitumen-100 text-bitumen-500", icon: <Lightbulb />,   label: "Thinking (thought)" },
  tool_call:   { dot: "bg-bitumen-900 text-white",      icon: <Wrench />,       label: "Step (tool call)" },
  tool_result: { dot: "bg-white text-bitumen-600 border border-bitumen-300", icon: <Eye />, label: "What came back (result)" },
  guardrail:   { dot: "bg-status-held text-white",      icon: <ShieldAlert />,  label: "Safety stop (guardrail)" },
  proposal:    { dot: "bg-rust-500 text-white",         icon: <Send />,         label: "Suggestion (proposal)" },
  final:       { dot: "bg-gum-500 text-white",          icon: <CheckCircle2 />, label: "Summary" },
  error:       { dot: "bg-red-500 text-white",          icon: <XCircle />,      label: "Error" },
};

function Step({ step, compact, names }: { step: AgentStep; compact: boolean; names: Map<string, string> }) {
  const st = KIND_STYLE[step.kind] ?? KIND_STYLE.system;
  const p = asObj(step.payload);
  return (
    <li className="relative py-2.5">
      <Dot className={st.dot}>{st.icon}</Dot>
      <div className="flex items-center gap-2 text-[11px] text-bitumen-400">
        <span className="font-semibold uppercase tracking-[0.1em]">{st.label}</span>
        <span>#{step.seq}</span>
        <span>{fmtTime(step.createdAt)}</span>
      </div>
      <div className="mt-1">
        {step.kind === "system" && <SystemStep name={step.name} p={p} />}
        {step.kind === "thought" && <p className="italic leading-6 text-bitumen-500">{String(p.text ?? "")}</p>}
        {step.kind === "tool_call" && <ToolCall name={step.name} p={p} names={names} compact={compact} />}
        {step.kind === "tool_result" && <ToolResult name={step.name} payload={step.payload} compact={compact} />}
        {step.kind === "guardrail" && <Guardrail name={step.name} p={p} />}
        {step.kind === "proposal" && <ToolResult name={step.name} payload={step.payload} compact={compact} />}
        {step.kind === "final" && <FinalStep text={String(p.text ?? "")} />}
        {step.kind === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            <span className="font-semibold">{step.name ?? "error"}:</span> {String(p.message ?? JSON.stringify(step.payload))}
          </div>
        )}
      </div>
    </li>
  );
}

function SystemStep({ name, p }: { name: string | null; p: Payload }) {
  const caps = asObj(p.caps);
  return (
    <div className="text-[13px] text-bitumen-500">
      <span className="font-medium text-bitumen-700">Check {name ?? "started"}</span>
      {p.model ? <> · the AI (model) <span className="font-mono">{String(p.model)}</span></> : null}
      {p.mock != null ? <> · {p.mock ? "fixed script (mock)" : "live AI"}</> : null}
      {caps.maxSteps != null ? <> · safety limits (caps): {String(caps.maxSteps)} steps, {fmtUsd(Number(caps.maxCost), 2)} per run, {fmtUsd(Number(caps.daily), 2)} per 24 h</> : null}
    </div>
  );
}

function Disclosure({ json, compact }: { json: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-[32px] items-center gap-1 rounded-md px-1 text-[12px] font-medium text-bitumen-500 hover:text-bitumen-900"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} details
      </button>
      {open && (
        <pre className={`mt-1 overflow-auto rounded-lg border border-bitumen-200 bg-bitumen-50 p-3 font-mono text-[11px] leading-5 text-bitumen-800 ${compact ? "max-h-56" : "max-h-96"}`}>
          {json}
        </pre>
      )}
    </div>
  );
}

function ToolCall({ name, p, names, compact }: { name: string | null; p: Payload; names: Map<string, string>; compact: boolean }) {
  const risk = String(p.risk ?? "read");
  const args = asObj(p.args);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-bitumen-900">{callSummary(name, args, names)}</span>
        <Pill tone={risk === "propose" ? "accent" : "neutral"}>{risk === "propose" ? "suggests only (propose)" : "looks only (read)"}</Pill>
      </div>
      <Disclosure json={JSON.stringify({ tool: name, args }, null, 2)} compact={compact} />
    </div>
  );
}

function fmtArg(v: unknown): string {
  if (typeof v === "string") return v.length > 90 ? v.slice(0, 88) + "…" : v;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  const s = JSON.stringify(v);
  return s.length > 90 ? s.slice(0, 88) + "…" : s;
}

function ToolResult({ name, payload, compact }: { name: string | null; payload: unknown; compact: boolean }) {
  const json = JSON.stringify(payload, null, 2) ?? "null";
  return (
    <div>
      <div className="text-[13px] text-bitumen-700">
        <span className="font-mono text-[12px] text-bitumen-500">{name}</span> returned {summarise(payload)}
      </div>
      <Disclosure json={json} compact={compact} />
    </div>
  );
}

function summarise(v: unknown): string {
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (v && typeof v === "object") {
    const o = v as Payload;
    if (typeof o.error === "string") return `an error: ${o.error}`;
    if (typeof o.actionId === "string") return `action ${o.actionId} (${String(o.status ?? "proposed")})`;
    const keys = Object.keys(o);
    const head = keys.slice(0, 4).map((k) => {
      const val = o[k];
      const vs = typeof val === "object" ? (Array.isArray(val) ? `[${val.length}]` : "{…}") : fmtArg(val);
      return `${k}: ${vs}`;
    }).join(", ");
    return keys.length > 4 ? `${head}, +${keys.length - 4} more` : head;
  }
  return fmtArg(v);
}

function Guardrail({ name, p }: { name: string | null; p: Payload }) {
  const reason = (() => {
    switch (name) {
      case "daily_cap": return `The daily spending limit (24-hour cap) was reached: ${fmtUsd(Number(p.spentUsd), 2)} spent against a ${fmtUsd(Number(p.capUsd), 2)} limit, so the check was refused.`;
      case "run_cost_cap": return `This check hit its spending limit (run cost cap): ${fmtUsd(Number(p.costUsd))} against ${fmtUsd(Number(p.capUsd), 2)}, so it stopped.`;
      case "step_cap": return `The limit of ${String(p.maxSteps)} steps (step cap) was reached, so the check stopped.`;
      case "unknown_tool": return `The AI asked for a step that does not exist (${String(p.name)}), so it was refused.`;
      case "invalid_arguments": return `The AI filled in the step ${String(p.tool)} wrongly (${String(p.problem)}). It was told why and asked again.`;
      case "bad_json": return `The AI answered in a format the software could not read (malformed JSON) for ${String(p.tool)}, so the step was refused.`;
      default: return JSON.stringify(p);
    }
  })();
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div><span className="font-semibold">Safety stop (guardrail: {name?.replace(/_/g, " ")}).</span> {reason}</div>
    </div>
  );
}

function FinalStep({ text }: { text: string }) {
  const paras = text.split(/\n{2,}|\n(?=[-•\d])/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className="rounded-xl border border-gum-200 bg-gum-50 px-4 py-3 text-[13px] leading-6 text-gum-900">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gum-700">
        <FileText className="h-3.5 w-3.5" /> Summary for you
      </div>
      {paras.map((p, i) => <p key={i} className={i > 0 ? "mt-2" : ""}>{p}</p>)}
    </div>
  );
}
