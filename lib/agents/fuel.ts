/**
 * Fuel agent.
 *
 * Trigger: a new diesel price observation (feed, ACCC weekly, or a scenario).
 * Job: for every customer whose contract indexes a fuel levy, work out what the
 * levy should be at today's price, quantify the weekly revenue gap, and propose
 * a rate-card update with the customer notice drafted. It reads prices and
 * contracts, it computes with a deterministic engine, and it proposes. It does
 * not change a rate card itself.
 */
import { computeLevyPct, levyDelta, surchargeNoticeText, tripFuelCost } from "../au/fuel-levy";
import { latestDieselPrice, priceHistory } from "../au/fuel-prices";
import { listCustomers, getCustomer } from "../domain/repo";
import { propose } from "./executor";
import type { AgentSpec, RunContext, ToolDef } from "./runtime";
import type { Risk } from "../domain/types";

export const OPERATOR_NAME = "Brisbane Demo Fleet";
export const PROPOSAL_THRESHOLD_PP = 0.5; // percentage points

export function riskForWeeklyDelta(aud: number): Risk {
  const a = Math.abs(aud);
  if (a < 500) return "low";
  if (a < 3000) return "medium";
  return "high";
}

function isoDatePlusDays(now: number, days: number): string {
  return new Date(now + days * 86400_000).toISOString().slice(0, 10);
}

// ---------- Tools ----------

const getLatestDieselPrice: ToolDef<{ region?: string }> = {
  name: "get_latest_diesel_price",
  risk: "read",
  description: "Latest observed retail diesel price in cents per litre for the region (default: newest overall), with the previous observation for context.",
  parameters: { type: "object", properties: { region: { type: "string", description: "e.g. QLD" } } },
  handler: ({ region }, ctx) => {
    const latest = latestDieselPrice(ctx.accountId, region);
    const hist = priceHistory(ctx.accountId, 2);
    const previous = hist.find((p) => latest && p.id !== latest.id);
    return { latest, previous };
  },
};

const getPriceHistory: ToolDef<{ limit?: number }> = {
  name: "get_price_history",
  risk: "read",
  description: "Recent diesel price observations, newest first.",
  parameters: { type: "object", properties: { limit: { type: "integer" } } },
  handler: ({ limit }, ctx) => priceHistory(ctx.accountId, limit ?? 10),
};

const listCustomerContracts: ToolDef<Record<string, never>> = {
  name: "list_customer_contracts",
  risk: "read",
  description: "All customers with their freight contract terms: base rate per km, levy method, reference diesel price the base rate assumes, fuel share, the levy currently applied, weekly loaded km, and notice period.",
  parameters: { type: "object", properties: {} },
  handler: (_a, ctx) => listCustomers(ctx.accountId),
};

const computeLevy: ToolDef<{ customerId: string; currentCpl: number }> = {
  name: "compute_levy",
  risk: "read",
  description: "Deterministic fuel levy calculation for one customer at a given diesel price. Returns the levy percentage the contract implies, the change versus the levy currently applied, the weekly revenue effect in AUD, and the risk tier.",
  parameters: {
    type: "object",
    properties: { customerId: { type: "string" }, currentCpl: { type: "number", description: "cents per litre" } },
    required: ["customerId", "currentCpl"],
  },
  handler: ({ customerId, currentCpl }, ctx) => {
    const c = getCustomer(customerId);
    if (!c || c.accountId !== ctx.accountId) return { error: "Customer not found" };
    if (c.levyMethod === "indexed" && !c.levyBaseCpl) return { error: "Contract has no reference diesel price; flag for review" };
    const pct = computeLevyPct({
      currentCpl, baseCpl: c.levyBaseCpl ?? 0, fuelShare: c.levyFuelShare,
      method: c.levyMethod, fixedPct: c.levyMethod === "fixed" ? c.levyCurrentPct : undefined,
    });
    const delta = levyDelta({ customer: c, newLevyPct: pct });
    const changePp = Number((pct - c.levyCurrentPct).toFixed(2));
    return {
      customer: c.name, method: c.levyMethod, baseCpl: c.levyBaseCpl, fuelShare: c.levyFuelShare,
      currentLevyPct: c.levyCurrentPct, impliedLevyPct: pct, changePercentagePoints: changePp,
      exceedsThreshold: Math.abs(changePp) >= PROPOSAL_THRESHOLD_PP,
      ...delta, risk: riskForWeeklyDelta(delta.weeklyRevenueDeltaAud),
    };
  },
};

const tripCost: ToolDef<{ km: number; litresPer100km: number; dieselCpl: number }> = {
  name: "trip_fuel_cost",
  risk: "read",
  description: "Fuel litres and AUD cost for a trip.",
  parameters: {
    type: "object",
    properties: { km: { type: "number" }, litresPer100km: { type: "number" }, dieselCpl: { type: "number" } },
    required: ["km", "litresPer100km", "dieselCpl"],
  },
  handler: (a) => tripFuelCost(a),
};

const proposeRateCardUpdate: ToolDef<{ customerId: string; newLevyPct: number; effectiveDate: string; rationale: string }> = {
  name: "propose_rate_card_update",
  risk: "propose",
  description: "Propose changing a customer's applied fuel levy. Drafts the customer notice automatically. Goes to the dispatcher's approval queue; it is never applied directly. Use only when compute_levy says exceedsThreshold.",
  parameters: {
    type: "object",
    properties: {
      customerId: { type: "string" }, newLevyPct: { type: "number" },
      effectiveDate: { type: "string", description: "YYYY-MM-DD, respecting the contract notice period" },
      rationale: { type: "string", description: "one or two plain sentences for the dispatcher" },
    },
    required: ["customerId", "newLevyPct", "effectiveDate", "rationale"],
  },
  handler: ({ customerId, newLevyPct, effectiveDate, rationale }, ctx) => {
    const c = getCustomer(customerId);
    if (!c || c.accountId !== ctx.accountId) return { error: "Customer not found" };
    const latest = latestDieselPrice(ctx.accountId);
    const delta = levyDelta({ customer: c, newLevyPct });
    const risk = riskForWeeklyDelta(delta.weeklyRevenueDeltaAud);
    const noticeBody = surchargeNoticeText({
      customerName: c.name, operatorName: OPERATOR_NAME, oldPct: c.levyCurrentPct, newPct: newLevyPct,
      effectiveDate, currentCpl: latest?.dieselCpl ?? 0, baseCpl: c.levyBaseCpl ?? 0, noticeDays: c.levyNoticeDays,
    });
    const action = propose({
      accountId: ctx.accountId, runId: ctx.runId, agent: "fuel",
      title: `${c.name}: fuel levy ${c.levyCurrentPct.toFixed(1)}% → ${newLevyPct.toFixed(1)}% from ${effectiveDate}`,
      description: `${rationale} Weekly revenue effect ≈ A$${delta.weeklyRevenueDeltaAud.toFixed(0)}.`,
      impactAud: delta.weeklyRevenueDeltaAud,
      // Rate card changes always wait for a human, whatever the size.
      risk: risk === "low" ? "medium" : risk,
      payload: { kind: "rate_card_update", data: { customerId, oldLevyPct: c.levyCurrentPct, newLevyPct, effectiveDate, noticeBody } as never },
    });
    ctx.notes.push(`Proposed ${c.name} levy ${c.levyCurrentPct.toFixed(1)}% → ${newLevyPct.toFixed(1)}% (A$${delta.weeklyRevenueDeltaAud.toFixed(0)}/week).`);
    return { actionId: action.id, status: action.status, risk: action.risk, weeklyRevenueDeltaAud: delta.weeklyRevenueDeltaAud, noticeDrafted: true };
  },
};

const flagForReview: ToolDef<{ subject: string; detail: string; customerId?: string }> = {
  name: "flag_for_review",
  risk: "propose",
  description: "Raise something a human should look at that is not a levy change: a contract missing its reference price, a customer on a stale fixed levy, a price observation that looks wrong.",
  parameters: {
    type: "object",
    properties: { subject: { type: "string" }, detail: { type: "string" }, customerId: { type: "string" } },
    required: ["subject", "detail"],
  },
  handler: ({ subject, detail, customerId }, ctx) => {
    const action = propose({
      accountId: ctx.accountId, runId: ctx.runId, agent: "fuel", title: subject, description: detail,
      risk: "low", payload: { kind: "flag_for_review", data: { subject, detail, customerId } },
    });
    ctx.notes.push(`Flagged: ${subject}`);
    return { actionId: action.id, status: action.status };
  },
};

// ---------- Spec ----------

const SYSTEM = `You are the fuel agent for ${OPERATOR_NAME}, a small road freight operator in Queensland, Australia.
Diesel is the operator's largest variable cost. Your job when a diesel price moves is to keep every customer's fuel levy in line with their contract, so the operator recovers fuel cost without over-charging anyone.

How to work:
1. Read the latest diesel price and the customer contracts.
2. For every customer, call compute_levy at the latest price. Never estimate a levy in your head; the engine is the source of truth.
3. Propose a rate-card update only when exceedsThreshold is true (a change of at least ${PROPOSAL_THRESHOLD_PP} percentage points). Set the effective date to today plus the contract's notice days.
4. Customers on method "none" or "fixed" get no levy proposal. If a fixed levy looks badly out of line with the indexed result (more than 5 points), flag it for review instead.
5. If a contract is missing its reference price, flag it for review.
6. Finish with a short plain-English summary for the dispatcher: what moved, who is affected, total weekly revenue effect, and anything flagged. Use Australian English and AUD. No marketing language. In the summary say "fuel surcharge" rather than "levy", "the customer's prices" rather than "rate card", and "cents a litre" rather than "c/L"; the reader runs trucks, not a finance desk.

Rules: you can read and propose. You cannot apply changes; every proposal goes to the dispatcher. Be concise in tool arguments.`;

async function mockPlan(ctx: RunContext) {
  const latest = latestDieselPrice(ctx.accountId);
  const cpl = latest?.dieselCpl ?? 281;
  const customers = listCustomers(ctx.accountId);
  const steps = [
    { tool: "get_latest_diesel_price", args: {}, thought: "Check what diesel is doing before touching any contract." },
    { tool: "list_customer_contracts", args: {} },
  ] as { tool: string; args: Record<string, unknown>; thought?: string }[];
  let proposals = 0;
  for (const c of customers) {
    steps.push({ tool: "compute_levy", args: { customerId: c.id, currentCpl: cpl } });
    if (c.levyMethod === "indexed" && c.levyBaseCpl) {
      const pct = computeLevyPct({ currentCpl: cpl, baseCpl: c.levyBaseCpl, fuelShare: c.levyFuelShare, method: "indexed" });
      if (Math.abs(pct - c.levyCurrentPct) >= PROPOSAL_THRESHOLD_PP) {
        proposals += 1;
        steps.push({
          tool: "propose_rate_card_update",
          args: {
            customerId: c.id, newLevyPct: pct, effectiveDate: isoDatePlusDays(ctx.now, c.levyNoticeDays),
            rationale: `Diesel at ${cpl.toFixed(1)} c/L against a contract reference of ${c.levyBaseCpl} c/L implies a ${pct.toFixed(1)}% levy under the indexed clause.`,
          },
          thought: `${c.name} is under-recovered at ${c.levyCurrentPct}%.`,
        });
      }
    } else if (c.levyMethod === "fixed") {
      steps.push({ tool: "flag_for_review", args: { customerId: c.id, subject: `${c.name}: fixed ${c.levyCurrentPct}% levy may be stale`, detail: "Fixed levies do not track the index. Consider renegotiating to an indexed clause at the next review." } });
    }
  }
  return { steps, summary: `Mock run: diesel ${cpl.toFixed(1)} c/L, ${customers.length} contracts reviewed, ${proposals} levy proposals raised for approval.` };
}

export const fuelAgent: AgentSpec = {
  name: "fuel",
  system: SYSTEM,
  tools: [getLatestDieselPrice, getPriceHistory, listCustomerContracts, computeLevy, tripCost, proposeRateCardUpdate, flagForReview],
  maxSteps: 16,
  mockPlan,
};

export function fuelTriggerMessage(args: { previousCpl?: number; currentCpl: number; region: string; source: string }): string {
  const prev = args.previousCpl ? `from ${args.previousCpl.toFixed(1)} c/L ` : "";
  return `Diesel in ${args.region} moved ${prev}to ${args.currentCpl.toFixed(1)} c/L (source: ${args.source}). Review every customer levy and propose what should change. Today is ${new Date().toISOString().slice(0, 10)}.`;
}
