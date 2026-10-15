"use client";

import { useState } from "react";
import {
  AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, Cpu, Eye, FileText,
  Lightbulb, Send, ShieldAlert, Wrench, XCircle,
} from "lucide-react";
import type { AgentRun, AgentStep, StepKind } from "@/lib/domain/types";
import { fmtDuration, fmtInt, fmtTime, fmtUsd } from "@/lib/ui/format";
import { Pill } from "@/components/ui/primitives";

type Payload = Record<string, unknown>;
const asObj = (p: unknown): Payload => (p && typeof p === "object" && !Array.isArray(p) ? (p as Payload) : {});

const AGENT_LABEL: Record<string, string> = { fuel: "Fuel agent", disruption: "Disruption agent", capacity: "Capacity agent" };

export function AgentTrace({ run, steps, compact = false }: { run: AgentRun; steps: AgentStep[]; compact?: boolean }) {
  const duration = run.finishedAt ? run.finishedAt - run.startedAt : null;
  const statusTone = run.status === "completed" ? "success" : run.status === "running" ? "info" : run.status === "failed" ? "danger" : "warning";
  const toolCalls = run.toolCalls || steps.filter((s) => s.kind === "tool_call").length;

  return (
    <div className="text-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
          <Bot className="h-4 w-4 text-ink-500" /> {AGENT_LABEL[run.agent] ?? run.agent}
        </span>
        <Pill tone={statusTone}>{run.status.replace("_", " ")}</Pill>
        <Pill tone={run.mock ? "neutral" : "info"}>{run.mock ? "scripted plan" : "live model"}</Pill>
        <span className="font-mono text-[11px] text-ink-500">{run.model}</span>
      </div>
      <div className="mt-1 truncate text-xs text-ink-500" title={run.trigger}>Trigger: {run.trigger}</div>
      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-3 md:grid-cols-6"}`}>
        <Meta label="Tool calls" value={fmtInt(toolCalls)} />
        <Meta label="Tokens in" value={fmtInt(run.inputTokens)} />
        <Meta label="Tokens out" value={fmtInt(run.outputTokens)} />
        <Meta label="Cost" value={fmtUsd(run.costUsd)} />
        <Meta label="Duration" value={fmtDuration(duration)} />
        <Meta label="Started" value={fmtTime(run.startedAt)} />
      </div>

      {/* Timeline */}
      <ol className="relative mt-4 space-y-0 border-l border-ink-200 pl-5">
        {steps.map((s) => <Step key={s.id} step={s} compact={compact} />)}
        {run.status === "running" && (
          <li className="relative py-2">
            <Dot className="bg-signal-500 animate-pulse" />
            <div className="text-xs text-ink-500">Agent is working…</div>
          </li>
        )}
        {steps.length === 0 && run.status !== "running" && (
          <li className="py-2 text-xs text-ink-500">No steps recorded.</li>
        )}
      </ol>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 px-2.5 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">{label}</div>
      <div className="mt-0.5 font-mono text-[12px] font-semibold text-ink-800">{value}</div>
    </div>
  );
}

function Dot({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={`absolute -left-[29px] top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-4 ring-white [&>svg]:h-3 [&>svg]:w-3 ${className}`}>
      {children}
    </span>
  );
}

const KIND_STYLE: Record<StepKind, { dot: string; icon: React.ReactNode; label: string }> = {
  system:      { dot: "bg-ink-300 text-white",      icon: <Cpu />,          label: "System" },
  thought:     { dot: "bg-ink-100 text-ink-500",    icon: <Lightbulb />,    label: "Thought" },
  tool_call:   { dot: "bg-signal-500 text-white",   icon: <Wrench />,       label: "Tool call" },
  tool_result: { dot: "bg-signal-100 text-signal-700", icon: <Eye />,       label: "Result" },
  guardrail:   { dot: "bg-amber-500 text-white",    icon: <ShieldAlert />,  label: "Guardrail" },
  proposal:    { dot: "bg-violet-500 text-white",   icon: <Send />,         label: "Proposal" },
  final:       { dot: "bg-emerald-500 text-white",  icon: <CheckCircle2 />, label: "Final" },
  error:       { dot: "bg-red-500 text-white",      icon: <XCircle />,      label: "Error" },
};

function Step({ step, compact }: { step: AgentStep; compact: boolean }) {
  const st = KIND_STYLE[step.kind] ?? KIND_STYLE.system;
  const p = asObj(step.payload);
  return (
    <li className="relative py-2">
      <Dot className={st.dot}>{st.icon}</Dot>
      <div className="flex items-center gap-2 text-[11px] text-ink-400">
        <span className="font-semibold uppercase tracking-[0.1em]">{st.label}</span>
        <span>#{step.seq}</span>
        <span>{fmtTime(step.createdAt)}</span>
      </div>
      <div className="mt-1">
        {step.kind === "system" && <SystemStep name={step.name} p={p} />}
        {step.kind === "thought" && <p className="italic leading-6 text-ink-600">{String(p.text ?? "")}</p>}
        {step.kind === "tool_call" && <ToolCall name={step.name} p={p} />}
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
    <div className="text-[13px] text-ink-500">
      <span className="font-medium text-ink-700">{name ?? "system"}</span>
      {p.model ? <> · model <span className="font-mono">{String(p.model)}</span></> : null}
      {p.mock != null ? <> · {p.mock ? "scripted plan" : "live model"}</> : null}
      {caps.maxSteps != null ? <> · caps: {String(caps.maxSteps)} steps, {fmtUsd(Number(caps.maxCost), 2)}/run, {fmtUsd(Number(caps.daily), 2)}/24h</> : null}
    </div>
  );
}

function ToolCall({ name, p }: { name: string | null; p: Payload }) {
  const risk = String(p.risk ?? "read");
  const args = asObj(p.args);
  const entries = Object.entries(args);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-ink-900 px-2 py-0.5 font-mono text-[12px] font-semibold text-white">{name}</code>
        <Pill tone={risk === "propose" ? "warning" : "info"}>{risk}</Pill>
      </div>
      {entries.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {entries.map(([k, v]) => (
            <span key={k} className="inline-flex max-w-full items-baseline gap-1 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
              <span className="text-ink-400">{k}=</span>
              <span className="truncate">{fmtArg(v)}</span>
            </span>
          ))}
        </div>
      )}
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
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(payload, null, 2) ?? "null";
  const summary = summarise(payload);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 py-1 text-left text-[12px] text-ink-700 hover:bg-ink-50"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-400" />}
        <span className="font-mono text-ink-500">{name}</span>
        <span className="truncate text-ink-600">{summary}</span>
      </button>
      {open && (
        <pre className={`mt-1.5 overflow-auto rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-[11px] leading-5 text-ink-800 ${compact ? "max-h-56" : "max-h-96"}`}>
          {json}
        </pre>
      )}
    </div>
  );
}

function summarise(v: unknown): string {
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (v && typeof v === "object") {
    const o = v as Payload;
    if (typeof o.error === "string") return `error: ${o.error}`;
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
      case "daily_cap": return `24-hour spend cap reached: ${fmtUsd(Number(p.spentUsd), 2)} spent against a ${fmtUsd(Number(p.capUsd), 2)} cap. Run refused.`;
      case "run_cost_cap": return `Per-run cost cap reached: ${fmtUsd(Number(p.costUsd))} against ${fmtUsd(Number(p.capUsd), 2)}. Loop stopped.`;
      case "step_cap": return `Step cap of ${String(p.maxSteps)} reached. Loop stopped.`;
      case "unknown_tool": return `Model asked for a tool that does not exist: ${String(p.name)}. Call refused.`;
      case "invalid_arguments": return `Arguments for ${String(p.tool)} failed schema validation: ${String(p.problem)}. Model was told why.`;
      case "bad_json": return `Model returned malformed JSON arguments for ${String(p.tool)}. Call refused.`;
      default: return JSON.stringify(p);
    }
  })();
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div><span className="font-semibold">{name}</span> · {reason}</div>
    </div>
  );
}

function FinalStep({ text }: { text: string }) {
  const paras = text.split(/\n{2,}|\n(?=[-•\d])/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] leading-6 text-emerald-950">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
        <FileText className="h-3.5 w-3.5" /> Summary for the dispatcher
      </div>
      {paras.map((p, i) => <p key={i} className={i > 0 ? "mt-2" : ""}>{p}</p>)}
    </div>
  );
}
