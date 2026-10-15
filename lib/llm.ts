/**
 * Model adapter. One shape for the agent runtime, the helper and the evals,
 * backed by Claude (default) or OpenAI (LLM_PROVIDER=openai). The runtime's
 * loop, caps and trace do not care which provider answered.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

export type Provider = "anthropic" | "openai";
export const PROVIDER: Provider = (process.env.LLM_PROVIDER as Provider) ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");

export const DEFAULT_MODEL =
  process.env.LLM_MODEL ?? (PROVIDER === "anthropic" ? (process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5") : (process.env.OPENAI_MODEL ?? "gpt-5.4-mini-2026-03-17"));

/** USD per 1M tokens. Override with LLM_PRICE_IN / LLM_PRICE_OUT. */
const PRICE_TABLE: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-opus-5": { in: 5, out: 25 },
  "gpt-5.4-mini-2026-03-17": { in: 0.25, out: 2.0 },
  "gpt-5.4-mini": { in: 0.25, out: 2.0 },
  "gpt-5.4": { in: 1.25, out: 10.0 },
};

export function priceFor(model: string): { in: number; out: number } {
  const envIn = Number(process.env.LLM_PRICE_IN ?? process.env.OPENAI_PRICE_IN);
  const envOut = Number(process.env.LLM_PRICE_OUT ?? process.env.OPENAI_PRICE_OUT);
  if (envIn > 0 && envOut > 0) return { in: envIn, out: envOut };
  return PRICE_TABLE[model] ?? PRICE_TABLE[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")] ?? { in: 4, out: 20 };
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

export function hasKey(): boolean {
  return PROVIDER === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(process.env.OPENAI_API_KEY);
}

// ---------- Neutral shapes ----------

export interface LlmTool { name: string; description: string; parameters: Record<string, unknown> }
export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };
export interface LlmToolCall { id: string; name: string; args: unknown; rawArgs: string }
export interface LlmTurn { text: string; toolCalls: LlmToolCall[]; usage: { input: number; output: number }; stop: string }

export interface ChatArgs { model: string; system: string; messages: LlmMessage[]; tools?: LlmTool[]; maxTokens?: number; jsonOnly?: boolean }

// ---------- Anthropic ----------

let anthropicClient: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!anthropicClient) {
    const ws = process.env.ANTHROPIC_WORKSPACE_ID;
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, defaultHeaders: ws ? { "anthropic-workspace-id": ws } : undefined, maxRetries: 2 });
  }
  return anthropicClient;
}

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: (tc.args ?? {}) as Record<string, unknown> });
      out.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "(no content)" }] });
    } else {
      // Consecutive tool results must sit in one user message.
      const last = out[out.length - 1];
      const block: Anthropic.ToolResultBlockParam = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
      if (last && last.role === "user" && Array.isArray(last.content) && last.content.every((b) => (b as { type: string }).type === "tool_result")) {
        (last.content as Anthropic.ContentBlockParam[]).push(block);
      } else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

async function chatAnthropic(a: ChatArgs): Promise<LlmTurn> {
  const tools: Anthropic.Tool[] | undefined = a.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema }));
  const res = await anthropic().messages.create({
    model: a.model,
    max_tokens: a.maxTokens ?? 4000,
    system: a.jsonOnly ? `${a.system}\n\nReply with a single JSON object and nothing else.` : a.system,
    messages: toAnthropicMessages(a.messages),
    tools,
    output_config: { effort: "low" },
  });
  let text = "";
  const toolCalls: LlmToolCall[] = [];
  for (const block of res.content) {
    if (block.type === "text") text += block.text;
    else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, args: block.input, rawArgs: JSON.stringify(block.input) });
  }
  return { text: text.trim(), toolCalls, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens }, stop: res.stop_reason ?? "end_turn" };
}

// ---------- OpenAI ----------

let openaiClient: OpenAI | null = null;
function openai(): OpenAI { return (openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })); }

async function chatOpenAI(a: ChatArgs): Promise<LlmTurn> {
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: a.system }];
  for (const m of a.messages) {
    if (m.role === "user") messages.push({ role: "user", content: m.content });
    else if (m.role === "assistant") messages.push({ role: "assistant", content: m.content || null, tool_calls: m.toolCalls?.map((tc) => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.rawArgs } })) });
    else messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
  }
  const tools: ChatCompletionTool[] | undefined = a.tools?.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const res = await openai().chat.completions.create({
    model: a.model, messages, tools, tool_choice: tools ? "auto" : undefined, max_completion_tokens: a.maxTokens ?? 4000,
    response_format: a.jsonOnly ? { type: "json_object" } : undefined,
  });
  const msg = res.choices[0].message;
  const toolCalls: LlmToolCall[] = [];
  for (const tc of msg.tool_calls ?? []) {
    if (tc.type !== "function") continue;
    let args: unknown = {};
    try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = null; }
    toolCalls.push({ id: tc.id, name: tc.function.name, args, rawArgs: tc.function.arguments });
  }
  return { text: (msg.content ?? "").trim(), toolCalls, usage: { input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0 }, stop: res.choices[0].finish_reason ?? "stop" };
}

export function chat(a: ChatArgs): Promise<LlmTurn> {
  return PROVIDER === "anthropic" ? chatAnthropic(a) : chatOpenAI(a);
}

/** Pull the first JSON object out of a text reply (Claude may wrap it in prose). */
export function parseJsonObject<T>(text: string): T {
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in reply");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
