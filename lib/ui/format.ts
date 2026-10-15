/** Client-side formatting and fetch helpers shared by the copilot pages. */

const BRISBANE = "Australia/Brisbane";

/** "15 Oct 2026, 14:05 AEST" */
export function fmtDateTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: BRISBANE, day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} AEST`;
}

/** "14:05 AEST" */
export function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("en-AU", { timeZone: BRISBANE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)) + " AEST";
}

export function fmtAud(n: number | null | undefined, opts: { sign?: boolean; decimals?: number } = {}): string {
  if (n == null || Number.isNaN(n)) return "—";
  const d = opts.decimals ?? 0;
  const abs = Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}A$${abs}`;
}

export function fmtUsd(n: number | null | undefined, decimals = 4): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `US$${n.toFixed(decimals)}`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-AU");
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * JSON fetch with the demo's conventions: 401 sends the visitor back to the
 * landing page (where the demo button re-issues the cookie), 429 surfaces the
 * server's rate-limit message, anything else throws with the server's error.
 */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/";
    throw new ApiError(401, "Sign in required");
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}
