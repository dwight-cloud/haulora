/**
 * Agent runtime.
 *
 * One loop, shared by every agent: send the conversation to the model with a
 * tool list, execute whatever tool it calls, append the result, repeat until
 * the model answers in prose or a cap trips. Every step is written to
 * agent_steps as it happens so the UI can stream the trace, and tokens are
 * priced per call so the cost meter is exact, not estimated.
 *
 * Safety rules enforced here, not left to prompts:
 *   - Tools are rated "read" or "propose". There is no "execute" rating. An
 *     agent can look and it can propose; a human (or the low-risk auto policy
 *     in executor.ts) is the only thing that changes rate cards or routes.
 *   - Step cap, per-run cost cap and a rolling 24h spend cap.
 *   - Tool arguments are validated against the tool's JSON schema (required
 *     keys and primitive types) before the handler runs; a bad call is logged
 *     as a guardrail event and the model is told why.
 *   - Mock mode when no API key is configured: the agent's scripted plan runs
 *     the same tools against the same data so the UI and evals still work.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { db } from "../db";
import { createRun, appendStep, finishRun, getRunWithSteps } from "../domain/repo";
import type { AgentName, AgentRun, AgentStep } from "../domain/types";

// ---------- Models and pricing ----------

export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini-2026-03-17";

/** USD per 1M tokens. Overridable with OPENAI_PRICE_IN / OPENAI_PRICE_OUT. */
const PRICE_TABLE: Record<string, { in: number; out: number }> = {
  "gpt-5.4-mini-2026-03-17": { in: 0.25, out: 2.0 },
  "gpt-5.4-mini":            { in: 0.25, out: 2.0 },
  "gpt-5.4-2026-03-05":      { in: 1.25, out: 10.0 },
  "gpt-5.4":                 { in: 1.25, out: 10.0 },
  "gpt-5-mini":              { in: 0.25, out: 2.0 },
  "gpt-4.1-mini":            { in: 0.40, out: 1.6 },
  "gpt-4.1":                 { in: 2.00, out: 8.0 },
};

export function priceFor(model: string): { in: number; out: number } {
  const envIn = Number(process.env.OPENAI_PRICE_IN);
  const envOut = Number(process.env.OPENAI_PRICE_OUT);
  if (envIn > 0 && envOut > 0) return { in: envIn, out: envOut };
  return PRICE_TABLE[model] ?? PRICE_TABLE[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")] ?? { in: 1, out: 4 };
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

// ---------- Caps ----------

export const CAPS = {
  maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 12),
  maxRunCostUsd: Number(process.env.AGENT_MAX_RUN_COST_USD ?? 0.25),
  dailySpendCapUsd: Number(process.env.AGENT_DAILY_SPEND_CAP_USD ?? 5),
};

export function spendLast24h(): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(cost_usd),0) AS c FROM agent_runs WHERE started_at > ?")
    .get(Date.now() - 24 * 3600 * 1000) as { c: number };
  return row.c;
}

// ---------- Tool model ----------

export type ToolRisk = "read" | "propose";

export interface ToolDef<A = Record<string, unknown>, R = unknown> {
  name: string;
  description: string;
  risk: ToolRisk;
  /** JSON schema for arguments. Only `type: object` with `properties` and `required` is validated here. */
  parameters: { type: "object"; properties: Record<string, { type: string; description?: string; enum?: string[] }>; required?: string[] };
  handler: (args: A, ctx: RunContext) => Promise<R> | R;
}

export interface RunContext {
  accountId: string;
  runId: string;
  agent: AgentName;
  now: number;
  /** Agents push human-readable notes here; they land in the final summary. */
  notes: string[];
}

export interface MockStep {
  tool: string;
  args: Record<string, unknown>;
  thought?: string;
}

export interface AgentSpec {
  name: AgentName;
  system: string;
  tools: ToolDef<any, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  maxSteps?: number;
  maxCostUsd?: number;
  /** Always run the scripted plan, even when a key is present (rules-only agents). */
  forceMock?: boolean;
  /** Scripted plan for mock mode. Must only use tools from `tools`. */
  mockPlan: (ctx: RunContext) => Promise<{ steps: MockStep[]; summary: string }>;
}

export interface RunResult {
  run: AgentRun;
  steps: AgentStep[];
}

// ---------- Validation ----------

function validateArgs(tool: ToolDef, args: unknown): string | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return "arguments must be an object";
  const a = args as Record<string, unknown>;
  for (const req of tool.parameters.required ?? []) {
    if (!(req in a)) return `missing required argument "${req}"`;
  }
  for (const [k, v] of Object.entries(a)) {
    const spec = tool.parameters.properties[k];
    if (!spec) return `unknown argument "${k}"`;
    const t = spec.type;
    const ok =
      (t === "string" && typeof v === "string") ||
      (t === "number" && typeof v === "number" && Number.isFinite(v)) ||
      (t === "integer" && Number.isInteger(v)) ||
      (t === "boolean" && typeof v === "boolean") ||
      (t === "array" && Array.isArray(v)) ||
      (t === "object" && typeof v === "object" && v !== null);
    if (!ok) return `argument "${k}" should be ${t}`;
    if (spec.enum && !spec.enum.includes(String(v))) return `argument "${k}" must be one of ${spec.enum.join(", ")}`;
  }
  return null;
}

function toOpenAITools(tools: ToolDef[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: `[${t.risk}] ${t.description}`, parameters: t.parameters },
  }));
}

function truncate(v: unknown, max = 6000): unknown {
  const s = JSON.stringify(v);
  if (s.length <= max) return v;
  return { truncated: true, preview: s.slice(0, max) };
}

// ---------- The loop ----------

export function isMockMode(): boolean {
  return process.env.MOCK_AGENTS === "1" || !process.env.OPENAI_API_KEY;
}

export async function runAgent(
  spec: AgentSpec,
  input: { accountId: string; trigger: string; userMessage: string; model?: string },
): Promise<RunResult> {
  const model = input.model ?? DEFAULT_MODEL;
  const mock = spec.forceMock || isMockMode();
  const run = createRun({ accountId: input.accountId, agent: spec.name, trigger: input.trigger, model, mock });
  const ctx: RunContext = { accountId: input.accountId, runId: run.id, agent: spec.name, now: Date.now(), notes: [] };
  const toolsByName = new Map(spec.tools.map((t) => [t.name, t]));
  const maxSteps = spec.maxSteps ?? CAPS.maxSteps;
  const maxCost = spec.maxCostUsd ?? CAPS.maxRunCostUsd;

  let inputTokens = 0, outputTokens = 0, cost = 0, toolCalls = 0;

  appendStep(run.id, "system", "start", { model, mock, trigger: input.trigger, caps: { maxSteps, maxCost, daily: CAPS.dailySpendCapUsd } });

  const finish = (status: AgentRun["status"], summary?: string, error?: string) => {
    finishRun(run.id, { status, summary, error, inputTokens, outputTokens, costUsd: cost, toolCalls });
    const full = getRunWithSteps(run.id);
    if (!full) throw new Error(`Run ${run.id} vanished`);
    return { run: full.run, steps: full.steps };
  };

  // Daily cap check happens before any model call, even in mock mode, so the
  // behaviour is identical in the demo and in production.
  const spent = spendLast24h();
  if (!mock && spent >= CAPS.dailySpendCapUsd) {
    appendStep(run.id, "guardrail", "daily_cap", { spentUsd: spent, capUsd: CAPS.dailySpendCapUsd });
    return finish("budget_exceeded", undefined, `Daily spend cap reached (US$${spent.toFixed(2)} of US$${CAPS.dailySpendCapUsd})`);
  }

  async function callTool(name: string, rawArgs: unknown): Promise<unknown> {
    const tool = toolsByName.get(name);
    if (!tool) {
      appendStep(run.id, "guardrail", "unknown_tool", { name });
      return { error: `Unknown tool "${name}"` };
    }
    const problem = validateArgs(tool, rawArgs);
    if (problem) {
      appendStep(run.id, "guardrail", "invalid_arguments", { tool: name, problem, args: rawArgs });
      return { error: `Invalid arguments for ${name}: ${problem}` };
    }
    toolCalls += 1;
    appendStep(run.id, "tool_call", name, { risk: tool.risk, args: rawArgs });
    try {
      const result = await tool.handler(rawArgs as Record<string, unknown>, ctx);
      appendStep(run.id, "tool_result", name, truncate(result));
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendStep(run.id, "error", name, { message: msg });
      return { error: msg };
    }
  }

  // ----- Mock path -----
  if (mock) {
    try {
      const plan = await spec.mockPlan(ctx);
      for (const step of plan.steps.slice(0, maxSteps)) {
        if (step.thought) appendStep(run.id, "thought", null, { text: step.thought });
        await callTool(step.tool, step.args);
      }
      const summary = [plan.summary, ...ctx.notes].join("\n");
      appendStep(run.id, "final", null, { text: summary });
      return finish("completed", summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendStep(run.id, "error", "mock", { message: msg });
      return finish("failed", undefined, msg);
    }
  }

  // ----- Live path -----
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: spec.system },
    { role: "user", content: input.userMessage },
  ];
  const tools = toOpenAITools(spec.tools);

  try {
    for (let step = 0; step < maxSteps; step++) {
      const res = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto",
        max_completion_tokens: 1800,
      });
      const usage = res.usage;
      if (usage) {
        inputTokens += usage.prompt_tokens ?? 0;
        outputTokens += usage.completion_tokens ?? 0;
        cost = costUsd(model, inputTokens, outputTokens);
      }
      const choice = res.choices[0];
      const msg = choice.message;

      if (msg.content && msg.content.trim()) {
        appendStep(run.id, msg.tool_calls?.length ? "thought" : "final", null, { text: msg.content });
      }

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const summary = [msg.content ?? "", ...ctx.notes].filter(Boolean).join("\n");
        return finish("completed", summary);
      }

      messages.push(msg);
      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        let args: unknown = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); }
        catch { appendStep(run.id, "guardrail", "bad_json", { tool: tc.function.name, raw: tc.function.arguments }); }
        const result = await callTool(tc.function.name, args);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(truncate(result)) });
      }

      if (cost >= maxCost) {
        appendStep(run.id, "guardrail", "run_cost_cap", { costUsd: cost, capUsd: maxCost });
        return finish("budget_exceeded", undefined, `Run cost cap reached (US$${cost.toFixed(3)})`);
      }
    }
    appendStep(run.id, "guardrail", "step_cap", { maxSteps });
    const summary = ctx.notes.join("\n") || "Stopped at the step cap before a final answer.";
    return finish("budget_exceeded", summary, `Step cap of ${maxSteps} reached`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendStep(run.id, "error", "model", { message: msg });
    return finish("failed", undefined, msg);
  }
}
