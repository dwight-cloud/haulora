/**
 * The Haulio helper: a read-only chat assistant that explains the system and
 * what is happening in the user's fleet right now. It reuses the agent runtime
 * so it gets the same caps, trace and cost accounting, but it has no propose
 * tools at all. It can look; it cannot change anything.
 */
import { latestDieselPrice } from "./au/fuel-prices";
import { listActiveEvents } from "./au/road-events";
import { listActions, listCustomers, listLoads, listRuns, listTrucks, getRunWithSteps } from "./domain/repo";
import { CAPS, DEFAULT_MODEL, isMockMode, spendLast24h } from "./agents/runtime";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
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
  "What is Haulio and how would it help me?",
  "What should I click first?",
  "What did the last agent run do, and why?",
  "What is waiting for my decision right now?",
  "How does the fuel levy calculation work?",
  "What happens when I approve something?",
];

const PAGE_GUIDE: Record<string, string> = {
  "/dashboard": "Overview: today's fleet at a glance, what needs a decision, and the 'Try a scenario' buttons that wake an AI agent.",
  "/fleet": "Fleet: every truck, where it is, who is driving, fuel level and hours left today.",
  "/loads": "Loads: every consignment, its customer, status, due time and route on the map.",
  "/customers": "Customers: contracts, base rate per km, the fuel levy clause and whether the levy applied is out of date.",
  "/disruptions": "Disruptions: active road closures and weather, and which loads they touch.",
  "/decisions": "Decisions: proposals from the AI agents waiting for approval. Approving applies the change; rejecting discards it.",
  "/agents": "AI agents: the three helpers, what each watches, their rules, and the scenario buttons.",
  "/evals": "Reports: how accurate the agents are on 100 test cases and what each run costs.",
  "/about": "How it works: the architecture, data sources and limits of this proof of concept.",
};

const SYSTEM = `You are the Haulio helper. Haulio is a fleet management system for small Australian road freight operators (5 to 50 trucks) with three AI agents inside it:
- Fuel agent: when the diesel price moves, works out what each customer's fuel levy should be under their contract and proposes rate-card updates with the customer notice drafted.
- Disruption agent: when a road closes or weather hits, finds the loads affected, plans a truck-legal detour with HERE, and proposes reroute, hold, or escalation per load.
- Capacity agent (Phase 2, rules only in this proof of concept): when a driver is unavailable, finds uncovered loads and proposes fatigue-legal reassignments.
Agents never change anything themselves. They propose; the dispatcher approves on the Decisions page. Low-risk housekeeping (customer notices, review flags) is recorded automatically.
This is a proof of concept: the fleet is seeded (8 trucks, 6 customers, 20 loads in Queensland), diesel prices come from 2026 ACCC reference points, closures are seeded or triggered by scenario buttons, HERE routing and Open-Meteo weather are live, and the model is real.

Your job: explain the system, say what to click next, and describe what is happening in the fleet right now using the tools. Be concrete, short, and plain. Use Australian English and A$. Answer in at most 120 words unless asked for detail. When the user asks what to click, give a numbered path of two or three clicks with page names. Never claim an action was taken; you can only read. If asked something outside Haulio, say so briefly.`;

type Tool = { def: ChatCompletionTool; run: (args: Record<string, unknown>, accountId: string) => unknown };

const tools: Tool[] = [
  { def: { type: "function", function: { name: "fleet_snapshot", description: "Current counts: trucks by status, loads by status, diesel price, active disruptions, decisions pending, last 24h model spend.", parameters: { type: "object", properties: {} } } },
    run: (_a, accountId) => {
      const trucks = listTrucks(accountId); const loads = listLoads(accountId);
      const by = <T,>(xs: T[], k: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => { m[k(x)] = (m[k(x)] ?? 0) + 1; return m; }, {});
      const pending = listActions(accountId, "proposed");
      return { trucks: by(trucks, (t) => t.status), loads: by(loads, (l) => l.status), diesel: latestDieselPrice(accountId), activeDisruptions: listActiveEvents(accountId).map((e) => ({ title: e.title, severity: e.severity, road: e.road })), decisionsPending: pending.length, pendingImpactAud: pending.reduce((s, a) => s + a.impactAud, 0), spend24hUsd: spendLast24h(), caps: CAPS };
    } },
  { def: { type: "function", function: { name: "pending_decisions", description: "Proposals waiting for the dispatcher: agent, title, risk, A$ impact, description.", parameters: { type: "object", properties: {} } } },
    run: (_a, accountId) => listActions(accountId, "proposed").slice(0, 10).map((a) => ({ agent: a.agent, title: a.title, risk: a.risk, impactAud: a.impactAud, description: a.description })) },
  { def: { type: "function", function: { name: "last_run", description: "The most recent agent run: which agent, why it woke, what it concluded, and the human-readable steps.", parameters: { type: "object", properties: {} } } },
    run: (_a, accountId) => {
      const run = listRuns(accountId, 1)[0]; if (!run) return { none: true };
      const full = getRunWithSteps(run.id);
      const steps = (full?.steps ?? []).filter((s) => s.kind === "tool_call" || s.kind === "final" || s.kind === "guardrail").slice(0, 25).map((s) => ({ kind: s.kind, name: s.name, payload: JSON.stringify(s.payload).slice(0, 300) }));
      return { agent: run.agent, trigger: run.trigger, status: run.status, summary: run.summary, costUsd: run.costUsd, toolCalls: run.toolCalls, steps };
    } },
  { def: { type: "function", function: { name: "customers", description: "Customers with their fuel levy contract terms and the levy currently applied.", parameters: { type: "object", properties: {} } } },
    run: (_a, accountId) => listCustomers(accountId).map((c) => ({ name: c.name, levyMethod: c.levyMethod, levyBaseCpl: c.levyBaseCpl, levyCurrentPct: c.levyCurrentPct, weeklyKm: c.weeklyKm, baseRatePerKm: c.baseRatePerKm })) },
  { def: { type: "function", function: { name: "loads_at_risk", description: "Loads that are delayed, held, rerouted, or essential/perishable and in flight.", parameters: { type: "object", properties: {} } } },
    run: (_a, accountId) => listLoads(accountId).filter((l) => ["delayed", "held", "rerouted"].includes(l.status) || ((l.essential || l.perishable) && ["planned", "en_route"].includes(l.status))).slice(0, 12).map((l) => ({ ref: l.ref, status: l.status, from: l.originLabel, to: l.destLabel, dueAtIso: new Date(l.dueAt).toISOString(), essential: l.essential, perishable: l.perishable, valueAud: l.valueAud, replanReason: l.replanReason })) },
];

export interface AssistantReply { answer: string; costUsd: number; mock: boolean; suggestions: string[] }

export async function askAssistant(args: { accountId: string; question: string; page?: string; history?: Array<{ role: "user" | "assistant"; content: string }> }): Promise<AssistantReply> {
  const { accountId, question } = args;
  const pageHint = args.page ? (PAGE_GUIDE[args.page] ?? `The user is on ${args.page}.`) : "";
  const suggestions = STARTER_QUESTIONS.filter((q) => q !== question).slice(0, 3);

  if (isMockMode()) {
    const snap = tools[0].run({}, accountId) as { decisionsPending: number; diesel?: { dieselCpl: number } };
    const answer = `Haulio is a fleet management system with three AI helpers: one for fuel levies, one for road disruptions, and one for driver cover. Right now diesel is ${snap.diesel?.dieselCpl ?? "?"} c/L and ${snap.decisionsPending} decision(s) are waiting for you. Try this: 1) Open AI agents, 2) press "Diesel jumps 40 c/L", 3) open Decisions and approve a levy change. (The helper is in offline mode; set an API key for live answers.)`;
    return { answer, costUsd: 0, mock: true, suggestions };
  }
  if (spendLast24h() >= CAPS.dailySpendCapUsd) {
    return { answer: "The daily model budget for this demo is used up. The pages still work; try again tomorrow or raise the cap.", costUsd: 0, mock: false, suggestions };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM + (pageHint ? `\n\nThe user is currently on this page: ${pageHint}` : "") },
    ...(args.history ?? []).slice(-6).map((h) => ({ role: h.role, content: h.content }) as ChatCompletionMessageParam),
    { role: "user", content: question },
  ];
  let inTok = 0, outTok = 0;
  for (let i = 0; i < 4; i++) {
    const res = await client.chat.completions.create({ model: DEFAULT_MODEL, messages, tools: tools.map((t) => t.def), tool_choice: "auto", max_completion_tokens: 500 });
    inTok += res.usage?.prompt_tokens ?? 0; outTok += res.usage?.completion_tokens ?? 0;
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) {
      const answer = (msg.content ?? "").trim() || "I could not form an answer. Try asking what to click first.";
      const { costUsd } = await import("./agents/runtime");
      const cost = costUsd(DEFAULT_MODEL, inTok, outTok);
      db.prepare("INSERT INTO assistant_turns (id, account_id, page, question, answer, input_tokens, output_tokens, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(genId("ask"), accountId, args.page ?? null, question, answer, inTok, outTok, cost, Date.now());
      return { answer, costUsd: cost, mock: false, suggestions };
    }
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      if (tc.type !== "function") continue;
      const tool = tools.find((t) => t.def.type === "function" && t.def.function.name === tc.function.name);
      let result: unknown = { error: "unknown tool" };
      try { result = tool ? tool.run(JSON.parse(tc.function.arguments || "{}"), accountId) : result; } catch (e) { result = { error: e instanceof Error ? e.message : String(e) }; }
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) });
    }
  }
  return { answer: "That took more steps than I allow myself. Ask a narrower question.", costUsd: 0, mock: false, suggestions };
}

export function assistantSpend24h(): number {
  const r = db.prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM assistant_turns WHERE created_at > ?").get(Date.now() - 86400_000) as { c: number };
  return r.c;
}
