/**
 * The Haulora helper: a read-only chat assistant that explains the system and
 * what is happening in the user's fleet right now. It reuses the agent runtime
 * so it gets the same caps, trace and cost accounting, but it has no propose
 * tools at all. It can look; it cannot change anything.
 */
import { latestDieselPrice } from "./au/fuel-prices";
import { listActiveEvents } from "./au/road-events";
import { listActions, listCustomers, listLoads, listRuns, listTrucks, getRunWithSteps } from "./domain/repo";
import { CAPS, DEFAULT_MODEL, isMockMode, spendLast24h } from "./agents/runtime";
import { chat, costUsd, type LlmMessage, type LlmTool } from "./llm";
import { db } from "./db";
import { genId } from "./domain/schema";

db.exec(`
  CREATE TABLE IF NOT EXISTS assistant_turns (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL,
    page        TEXT,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd    REAL NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
`);

export const STARTER_QUESTIONS = [
  "What is Haulora and how would it help me?",
  "What should I click first?",
  "What did the AI helper just do, and why?",
  "What is waiting for my decision right now?",
  "How does the fuel surcharge work?",
  "What happens when I accept a suggestion?",
];

const PAGE_GUIDE: Record<string, string> = {
  "/dashboard": "Overview: today's trucks at a glance, what needs your decision, and the 'Try a scenario' buttons that wake an AI helper.",
  "/fleet": "Trucks: every truck, where it is, who is driving, fuel level and hours left today.",
  "/loads": "Delivery jobs: every job, its customer, status, due time and route on the map.",
  "/customers": "Customers: their prices, their fuel surcharge terms, and whether the surcharge you charge is out of date.",
  "/disruptions": "Road problems: closures, floods and bad weather, and which delivery jobs they affect.",
  "/decisions": "Your decisions: suggestions from the AI helpers waiting for you. Accepting applies the change; declining discards it.",
  "/agents": "AI helpers: the three helpers, what each watches, their rules, and the scenario buttons.",
  "/evals": "Accuracy tests: how often the helpers get it right on 100 test cases, and what each check costs.",
  "/about": "How it works: the architecture, data sources and limits of this proof of concept.",
};

const SYSTEM = `You are the Haulora helper. Haulora is a fleet management system for small Australian road freight operators (5 to 50 trucks) with three AI agents inside it:
- Fuel agent: when the diesel price moves, works out what each customer's fuel levy should be under their contract and proposes rate-card updates with the customer notice drafted.
- Disruption agent: when a road closes or weather hits, finds the loads affected, plans a truck-legal detour with HERE, and proposes reroute, hold, or escalation per load.
- Capacity agent (Phase 2, rules only in this proof of concept): when a driver is unavailable, finds uncovered loads and proposes fatigue-legal reassignments.
Agents never change anything themselves. They propose; the dispatcher approves on the Decisions page. Low-risk housekeeping (customer notices, review flags) is recorded automatically.
This is a proof of concept: the fleet is seeded (8 trucks, 6 customers, 20 loads in Queensland), diesel prices come from 2026 ACCC reference points, closures are seeded or triggered by scenario buttons, HERE routing and Open-Meteo weather are live, and the model is real.

Your job: explain the system, say what to click next, and describe what is happening in the fleet right now using the tools. Be concrete, short, and plain. Use Australian English and A$. Answer in at most 120 words unless asked for detail.

Speak like a helpful colleague, never like a manual. Use these plain words and, the first time you use one, add the explanation in brackets:
- "fuel surcharge" (the extra percentage added to a customer's bill when diesel goes up), never "levy"
- "the customer's prices", never "rate card"
- "delivery job", never "load" or "consignment"
- "on the road", "booked", "running late", "waiting at the depot", "new route" for statuses
- "needs your call" when the AI could not decide safely, never "escalate"
- "suggestion" / "accept" / "decline", never "proposal" / "approve" / "reject"
- "road problems" for closures, floods and bad weather, never "disruption"
- "urgent goods" and "goods that spoil", never "essential" or "perishable"
- "AI helper", "check", and "what the helper did", never "agent", "run" or "trace"
- "cents a litre", never "c/L"
- "driver cover" and "driving-hours rules", never "capacity" or "fatigue management"
The page names are: Overview, Trucks, Delivery jobs, Customers, Road problems, Your decisions, AI helpers, Accuracy tests, How it works. When the user asks what to click, give a numbered path of two or three clicks with page names. Never claim an action was taken; you can only read. If asked something outside Haulora, say so briefly.`;

type Tool = { def: LlmTool; run: (args: Record<string, unknown>, accountId: string) => unknown };

const tools: Tool[] = [
  { def: { name: "fleet_snapshot", description: "Current counts: trucks by status, loads by status, diesel price, active disruptions, decisions pending, last 24h model spend.", parameters: { type: "object", properties: {} } },
    run: (_a, accountId) => {
      const trucks = listTrucks(accountId); const loads = listLoads(accountId);
      const by = <T,>(xs: T[], k: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => { m[k(x)] = (m[k(x)] ?? 0) + 1; return m; }, {});
      const pending = listActions(accountId, "proposed");
      return { trucks: by(trucks, (t) => t.status), loads: by(loads, (l) => l.status), diesel: latestDieselPrice(accountId), activeDisruptions: listActiveEvents(accountId).map((e) => ({ title: e.title, severity: e.severity, road: e.road })), decisionsPending: pending.length, pendingImpactAud: pending.reduce((s, a) => s + a.impactAud, 0), spend24hUsd: spendLast24h(), caps: CAPS };
    } },
  { def: { name: "pending_decisions", description: "Proposals waiting for the dispatcher: agent, title, risk, A$ impact, description.", parameters: { type: "object", properties: {} } },
    run: (_a, accountId) => listActions(accountId, "proposed").slice(0, 10).map((a) => ({ agent: a.agent, title: a.title, risk: a.risk, impactAud: a.impactAud, description: a.description })) },
  { def: { name: "last_run", description: "The most recent agent run: which agent, why it woke, what it concluded, and the human-readable steps.", parameters: { type: "object", properties: {} } },
    run: (_a, accountId) => {
      const run = listRuns(accountId, 1)[0]; if (!run) return { none: true };
      const full = getRunWithSteps(run.id);
      const steps = (full?.steps ?? []).filter((s) => s.kind === "tool_call" || s.kind === "final" || s.kind === "guardrail").slice(0, 25).map((s) => ({ kind: s.kind, name: s.name, payload: JSON.stringify(s.payload).slice(0, 300) }));
      return { agent: run.agent, trigger: run.trigger, status: run.status, summary: run.summary, costUsd: run.costUsd, toolCalls: run.toolCalls, steps };
    } },
  { def: { name: "customers", description: "Customers with their fuel levy contract terms and the levy currently applied.", parameters: { type: "object", properties: {} } },
    run: (_a, accountId) => listCustomers(accountId).map((c) => ({ name: c.name, levyMethod: c.levyMethod, levyBaseCpl: c.levyBaseCpl, levyCurrentPct: c.levyCurrentPct, weeklyKm: c.weeklyKm, baseRatePerKm: c.baseRatePerKm })) },
  { def: { name: "loads_at_risk", description: "Loads that are delayed, held, rerouted, or essential/perishable and in flight.", parameters: { type: "object", properties: {} } },
    run: (_a, accountId) => listLoads(accountId).filter((l) => ["delayed", "held", "rerouted"].includes(l.status) || ((l.essential || l.perishable) && ["planned", "en_route"].includes(l.status))).slice(0, 12).map((l) => ({ ref: l.ref, status: l.status, from: l.originLabel, to: l.destLabel, dueAtIso: new Date(l.dueAt).toISOString(), essential: l.essential, perishable: l.perishable, valueAud: l.valueAud, replanReason: l.replanReason })) },
];

export interface AssistantReply { answer: string; costUsd: number; mock: boolean; suggestions: string[] }

export async function askAssistant(args: { accountId: string; question: string; page?: string; history?: Array<{ role: "user" | "assistant"; content: string }> }): Promise<AssistantReply> {
  const { accountId, question } = args;
  const pageHint = args.page ? (PAGE_GUIDE[args.page] ?? `The user is on ${args.page}.`) : "";
  const suggestions = STARTER_QUESTIONS.filter((q) => q !== question).slice(0, 3);

  if (isMockMode()) {
    const snap = tools[0].run({}, accountId) as { decisionsPending: number; diesel?: { dieselCpl: number } };
    const answer = `Haulora is a fleet management system with three AI helpers: one for fuel levies, one for road disruptions, and one for driver cover. Right now diesel is ${snap.diesel?.dieselCpl ?? "?"} c/L and ${snap.decisionsPending} decision(s) are waiting for you. Try this: 1) Open AI agents, 2) press "Diesel jumps 40 c/L", 3) open Decisions and approve a levy change. (The helper is in offline mode; set an API key for live answers.)`;
    return { answer, costUsd: 0, mock: true, suggestions };
  }
  if (spendLast24h() >= CAPS.dailySpendCapUsd) {
    return { answer: "The daily model budget for this demo is used up. The pages still work; try again tomorrow or raise the cap.", costUsd: 0, mock: false, suggestions };
  }

  const system = SYSTEM + (pageHint ? `\n\nThe user is currently on this page: ${pageHint}` : "");
  const messages: LlmMessage[] = [
    ...(args.history ?? []).slice(-6).map((h) => (h.role === "user" ? { role: "user" as const, content: h.content } : { role: "assistant" as const, content: h.content })),
    { role: "user", content: question },
  ];
  let inTok = 0, outTok = 0;
  for (let i = 0; i < 4; i++) {
    const turn = await chat({ model: DEFAULT_MODEL, system, messages, tools: tools.map((t) => t.def), maxTokens: 600 });
    inTok += turn.usage.input; outTok += turn.usage.output;
    if (turn.toolCalls.length === 0) {
      const answer = turn.text || "I could not form an answer. Try asking what to click first.";
      const cost = costUsd(DEFAULT_MODEL, inTok, outTok);
      db.prepare("INSERT INTO assistant_turns (id, account_id, page, question, answer, input_tokens, output_tokens, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(genId("ask"), accountId, args.page ?? null, question, answer, inTok, outTok, cost, Date.now());
      return { answer, costUsd: cost, mock: false, suggestions };
    }
    messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls });
    for (const tc of turn.toolCalls) {
      const tool = tools.find((t) => t.def.name === tc.name);
      let result: unknown = { error: "unknown tool" };
      try { result = tool ? tool.run((tc.args ?? {}) as Record<string, unknown>, accountId) : result; } catch (e) { result = { error: e instanceof Error ? e.message : String(e) }; }
      messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify(result).slice(0, 6000) });
    }
  }
  return { answer: "That took more steps than I allow myself. Ask a narrower question.", costUsd: 0, mock: false, suggestions };
}

export function assistantSpend24h(): number {
  const r = db.prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM assistant_turns WHERE created_at > ?").get(Date.now() - 86400_000) as { c: number };
  return r.c;
}
