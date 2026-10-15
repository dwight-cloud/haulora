/**
 * Action executor.
 *
 * Agents never change operational data. They create rows in `actions`, and
 * this module is the only thing that turns an action into a change. It runs
 * deterministic code per action kind, so an approval does exactly what the
 * card said it would, nothing the model improvises at execution time.
 *
 * Policy: low-risk actions auto-execute at proposal time (so the demo moves),
 * medium and high wait for a dispatcher. AUTO_EXECUTE_LOW_RISK=0 makes
 * everything wait.
 */
import {
  getAction, markActionExecuted, proposeAction, setCustomerLevy, setLoadRoute, setLoadStatus, getCustomer, getLoad,
} from "../domain/repo";
import type { Action, AgentName, Risk } from "../domain/types";

export type ActionKind = "rate_card_update" | "customer_notice" | "replan_load" | "hold_load" | "flag_for_review";

export interface RateCardUpdatePayload { customerId: string; oldLevyPct: number; newLevyPct: number; effectiveDate: string }
export interface CustomerNoticePayload { customerId: string; subject: string; body: string; channel: "email" }
export interface ReplanLoadPayload { loadId: string; polyline: string; km: number; hours: number; reason: string; eventId?: string }
export interface HoldLoadPayload { loadId: string; reason: string; eventId?: string }
export interface FlagForReviewPayload { subject: string; detail: string; loadId?: string; customerId?: string }

export type ActionPayload =
  | { kind: "rate_card_update"; data: RateCardUpdatePayload }
  | { kind: "customer_notice"; data: CustomerNoticePayload }
  | { kind: "replan_load"; data: ReplanLoadPayload }
  | { kind: "hold_load"; data: HoldLoadPayload }
  | { kind: "flag_for_review"; data: FlagForReviewPayload };

const AUTO_LOW = process.env.AUTO_EXECUTE_LOW_RISK !== "0";

/** Called by agent tools. Creates the action and, if policy allows, executes it immediately. */
export function propose(args: {
  accountId: string; runId: string; agent: AgentName; title: string; description?: string;
  impactAud?: number; risk: Risk; payload: ActionPayload;
}): Action {
  const action = proposeAction({
    accountId: args.accountId, runId: args.runId, agent: args.agent, kind: args.payload.kind,
    title: args.title, description: args.description ?? null, payload: args.payload,
    impactAud: args.impactAud ?? 0, risk: args.risk,
  });
  if (args.risk === "low" && AUTO_LOW) {
    return execute(action.id, "policy:auto-low-risk", "auto_executed");
  }
  return action;
}

/** Execute an approved (or auto) action. Idempotent: executing twice is a no-op. */
export function execute(actionId: string, by: string, finalStatus: "executed" | "auto_executed" = "executed"): Action {
  const action = getAction(actionId);
  if (!action) throw new Error(`Action ${actionId} not found`);
  if (action.status === "executed" || action.status === "auto_executed") return action;
  const payload = action.payload as ActionPayload;
  try {
    const result = apply(action, payload);
    return markActionExecuted(actionId, `${result} (by ${by})`, finalStatus) ?? action;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return markActionExecuted(actionId, msg, "failed") ?? action;
  }
}

function apply(action: Action, payload: ActionPayload): string {
  switch (payload.kind) {
    case "rate_card_update": {
      const c = getCustomer(payload.data.customerId);
      if (!c || c.accountId !== action.accountId) throw new Error("Customer not found for this account");
      setCustomerLevy(c.id, payload.data.newLevyPct);
      return `Fuel levy for ${c.name} set to ${payload.data.newLevyPct.toFixed(2)}% (was ${payload.data.oldLevyPct.toFixed(2)}%), effective ${payload.data.effectiveDate}`;
    }
    case "customer_notice": {
      const c = getCustomer(payload.data.customerId);
      if (!c || c.accountId !== action.accountId) throw new Error("Customer not found for this account");
      // Demo: notices are recorded, not sent. A production build plugs an email
      // provider in here and nothing else changes.
      return `Notice "${payload.data.subject}" queued to ${c.contactEmail ?? c.name} (demo: recorded, not sent)`;
    }
    case "replan_load": {
      const l = getLoad(payload.data.loadId);
      if (!l || l.accountId !== action.accountId) throw new Error("Load not found for this account");
      setLoadRoute(l.id, {
        current: { polyline: payload.data.polyline, km: payload.data.km, hours: payload.data.hours },
        status: "rerouted",
        replanReason: payload.data.reason,
      });
      return `${l.ref} re-planned: ${payload.data.km.toFixed(0)} km, ${payload.data.hours.toFixed(1)} h. ${payload.data.reason}`;
    }
    case "hold_load": {
      const l = getLoad(payload.data.loadId);
      if (!l || l.accountId !== action.accountId) throw new Error("Load not found for this account");
      setLoadStatus(l.id, "held");
      setLoadRoute(l.id, { replanReason: payload.data.reason });
      return `${l.ref} held at origin. ${payload.data.reason}`;
    }
    case "flag_for_review": {
      return `Flagged for dispatcher review: ${payload.data.subject}`;
    }
    default:
      throw new Error(`Unknown action kind`);
  }
}
