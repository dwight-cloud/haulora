"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Code2 } from "lucide-react";
import type { AgentRun, AgentStep } from "@/lib/domain/types";
import { fmtAud } from "@/lib/ui/format";
import { AgentTrace } from "./AgentTrace";

type Payload = Record<string, unknown>;
const asObj = (p: unknown): Payload => (p && typeof p === "object" && !Array.isArray(p) ? (p as Payload) : {});
const num = (v: unknown, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
const AGENT_LABEL: Record<string, string> = { fuel: "fuel agent", disruption: "disruption agent", capacity: "capacity agent" };

export interface StoryLine { text: string; tone: "normal" | "muted" | "propose" | "warn" | "error" | "final" }

/** Build id → human name from everything the agent saw. */
export function buildNames(steps: AgentStep[]): Map<string, string> {
  const names = new Map<string, string>();
  let lastArgs: Payload = {};
  const learn = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(learn); return; }
    const r = o as Payload;
    const id = typeof r.id === "string" ? r.id : null;
    const label = typeof r.name === "string" ? r.name : typeof r.ref === "string" ? r.ref : typeof r.code === "string" ? r.code : null;
    if (id && label) names.set(id, label);
    if (typeof r.loadId === "string" && typeof r.ref === "string") names.set(r.loadId, r.ref);
    if (typeof r.truckId === "string" && typeof r.truckCode === "string") names.set(r.truckId, r.truckCode);
  };
  for (const s of steps) {
    if (s.kind === "tool_call") { lastArgs = asObj(asObj(s.payload).args); continue; }
    if (s.kind === "tool_result") {
      learn(s.payload);
      const r = asObj(s.payload);
      if (typeof r.customer === "string" && typeof lastArgs.customerId === "string") names.set(lastArgs.customerId, r.customer);
    }
  }
  return names;
}

/** One plain-English line per agent step. Tool calls are paired with their result. */
export function storyLines(steps: AgentStep[]): StoryLine[] {
  const names = buildNames(steps);
  const nm = (id: unknown) => (typeof id === "string" ? names.get(id) ?? id : "—");
  const out: StoryLine[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const p = asObj(s.payload);
    if (s.kind === "thought") { out.push({ text: String(p.text ?? ""), tone: "muted" }); continue; }
    if (s.kind === "guardrail") { out.push({ text: `Stopped by a safety limit (${(s.name ?? "cap").replace(/_/g, " ")}). The agent is not allowed past this point.`, tone: "warn" }); continue; }
    if (s.kind === "error") { out.push({ text: `Something went wrong: ${String(p.message ?? "")}`, tone: "error" }); continue; }
    if (s.kind === "final") { out.push({ text: String(p.text ?? "").split(/\n{2,}/)[0] ?? "", tone: "final" }); continue; }
    if (s.kind !== "tool_call") continue;
    const args = asObj(p.args);
    const next = steps[i + 1];
    const res = next && next.kind === "tool_result" ? next.payload : null;
    const r = asObj(res);
    const arr = Array.isArray(res) ? (res as Payload[]) : null;
    const propose = p.risk === "propose";
    const err = typeof r.error === "string" ? r.error : null;
    let text: string;
    switch (s.name) {
      case "get_latest_diesel_price": {
        const latest = asObj(r.latest), prev = asObj(r.previous);
        text = `Checked today's diesel price: ${num(latest.dieselCpl)} c/L` + (prev.dieselCpl != null ? ` (was ${num(prev.dieselCpl)} c/L)` : "");
        break;
      }
      case "get_price_history": text = `Looked at the last ${arr?.length ?? "few"} diesel prices`; break;
      case "list_customer_contracts": text = `Read ${arr?.length ?? "the"} customer contracts`; break;
      case "compute_levy": {
        const who = typeof r.customer === "string" ? r.customer : nm(args.customerId);
        if (err) { text = `Could not work out ${who}'s levy: ${err}`; break; }
        const cur = Number(r.currentLevyPct), imp = Number(r.impliedLevyPct);
        const dir = imp > cur ? "up" : imp < cur ? "down" : "unchanged";
        text = `Worked out ${who}'s levy should be ${num(imp)}%` + (dir === "unchanged" ? ", the same as now" : `, ${dir} from ${num(cur)}%`);
        if (r.exceedsThreshold === false) text += ". Too small a move to bother the customer";
        else if (typeof r.weeklyRevenueDeltaAud === "number") text += `, worth ${fmtAud(r.weeklyRevenueDeltaAud, { sign: true })} a week`;
        break;
      }
      case "trip_fuel_cost": text = `Costed a trip's fuel: ${fmtAud(Number(r.costAud ?? r.aud))}`; break;
      case "propose_rate_card_update": text = `Proposed a rate-card change for ${nm(args.customerId)} to ${num(args.newLevyPct)}%, for approval`; break;
      case "flag_for_review": text = `Flagged for a human: ${String(args.subject ?? "")}`; break;
      case "list_active_disruptions": text = arr && arr.length ? `Found ${arr.length} active disruption${arr.length === 1 ? "" : "s"}: ${arr.map((e) => String(e.title ?? e.road ?? "")).join("; ")}` : "Found no active disruptions"; break;
      case "find_affected_loads": {
        const refs = [...new Set((arr ?? []).map((l) => String(l.ref ?? "")))];
        text = refs.length ? `${refs.length} load${refs.length === 1 ? " crosses" : "s cross"} the closure: ${refs.join(", ")}` : "No loads cross the closure";
        break;
      }
      case "weather_along_route": {
        const gust = arr ? Math.max(0, ...arr.map((w) => Number(w.windGustKmh) || 0)) : 0;
        const rain = arr ? Math.max(0, ...arr.map((w) => Number(w.precipitationMm) || 0)) : 0;
        text = `Checked the weather along ${nm(args.loadId)}'s route: gusts to ${gust.toFixed(0)} km/h, up to ${rain.toFixed(1)} mm of rain`;
        break;
      }
      case "plan_detour":
        text = r.found
          ? `Planned a detour for ${nm(args.loadId)}: ${num(r.detourHours)} h via the long way (${Number(r.deltaHours) >= 0 ? "+" : ""}${num(r.deltaHours)} h), with ${num(r.hoursUntilDue)} h until it is due`
          : `Could not find a truck-legal detour for ${nm(args.loadId)}`;
        break;
      case "propose_replan": text = `Proposed re-routing ${nm(args.loadId)}, for approval`; break;
      case "propose_hold": text = `Proposed holding ${nm(args.loadId)} until the road clears, for approval`; break;
      case "escalate": text = `Escalated ${nm(args.loadId)} to a human: ${String(args.subject ?? "")}`; break;
      case "draft_customer_notice": text = `Drafted a notice to the customer about ${nm(args.loadId)} (sent to the queue automatically, low risk)`; break;
      case "list_fleet_availability": text = `Checked ${arr?.length ?? "the"} trucks for who is free and legal to drive`; break;
      case "list_uncovered_loads": text = arr && arr.length ? `${arr.length} load${arr.length === 1 ? " has" : "s have"} no driver: ${arr.map((l) => String(l.ref ?? "")).join(", ")}` : "Every load has a driver"; break;
      case "fatigue_check": text = `Checked legal driving hours for ${nm(args.truckId)}: ${r.legal === false ? "not enough hours left today" : "within HVNL limits"}`; break;
      case "propose_reassignment": text = `Proposed moving ${nm(args.loadId)} onto ${nm(args.truckId)} (${num(args.emptyKm, 0)} km empty running), for approval`; break;
      case "escalate_uncovered": text = `Escalated ${nm(args.loadId)}: nobody can legally cover it today`; break;
      default: text = `${s.name ?? "Did something"}` + (err ? `: ${err}` : "");
    }
    out.push({ text, tone: err ? "warn" : propose ? "propose" : "normal" });
  }
  return out;
}

export function RunStory({ run, steps, compact = false }: { run: AgentRun; steps: AgentStep[]; compact?: boolean }) {
  const lines = useMemo(() => storyLines(steps), [steps]);
  const [eng, setEng] = useState(false);
  const label = AGENT_LABEL[run.agent] ?? run.agent;
  return (
    <div>
      <div className="text-xs text-bitumen-500">
        The {label} woke up because: <span className="font-medium text-bitumen-700">{run.trigger.replace(/^scenario:\w+\s*\((.*)\)$/, "$1")}</span>
        {run.mock ? " · running a scripted plan, no model key configured" : ""}
      </div>
      <ol className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <li key={i} className={`flex gap-3 text-[14px] leading-6 ${
            l.tone === "final" ? "rounded-lg border border-gum-200 bg-gum-50 px-3 py-2 text-gum-900" :
            l.tone === "propose" ? "font-medium text-rust-700" :
            l.tone === "warn" ? "text-amber-800" :
            l.tone === "error" ? "text-red-700" :
            l.tone === "muted" ? "italic text-bitumen-500" : "text-bitumen-800"}`}>
            <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${
              l.tone === "final" ? "bg-gum-500" : l.tone === "propose" ? "bg-rust-500" : l.tone === "warn" || l.tone === "error" ? "bg-amber-500" : "bg-bitumen-300"}`} aria-hidden />
            <span className="min-w-0">
              {l.tone === "warn" && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />}
              {l.text}
            </span>
          </li>
        ))}
        {run.status === "running" && <li className="text-[14px] italic text-bitumen-500">Still working…</li>}
        {lines.length === 0 && run.status !== "running" && <li className="text-sm text-bitumen-500">Nothing was recorded for this run.</li>}
      </ol>
      <button
        type="button"
        onClick={() => setEng((v) => !v)}
        aria-expanded={eng}
        className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-md text-[12px] font-semibold text-bitumen-500 hover:text-bitumen-900 md:min-h-0"
      >
        <Code2 className="h-3.5 w-3.5" /> Details for engineers {eng ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {eng && <div className="mt-2 border-t border-bitumen-100 pt-4"><AgentTrace run={run} steps={steps} compact={compact} /></div>}
    </div>
  );
}
