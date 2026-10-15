"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2, Play, RefreshCw, X } from "lucide-react";
import { HereMap } from "@/components/HereMap";
import { AgentTrace } from "@/components/AgentTrace";
import { Button, Card, CardBody, CardHeader, CardTitle, PageHeader, Pill, Stat } from "@/components/ui/primitives";
import type { Action, AgentRun, AgentStep, Load, RoadEvent, Truck, LoadStatus } from "@/lib/domain/types";
import { api, ApiError, fmtAud, fmtDateTime, fmtUsd } from "@/lib/ui/format";

interface Stats {
  loadsInFlight: number; trucks: number; trucksMoving: number;
  pendingActions: number; pendingImpactAud: number;
  executedActions: number; executedImpactAud: number;
  runs: number; totalCostUsd: number; totalTokens: number; spend24hUsd: number;
  caps: { maxSteps: number; maxRunCostUsd: number; dailySpendCapUsd: number };
  model: string; mock: boolean;
  diesel: { dieselCpl: number; region: string; capturedAt: number; source: string } | null;
  activeEvents: number;
}
interface Scenario { id: string; title: string; blurb: string; agent: string | null }
interface ScenarioResult { scenario: string; run?: { run: AgentRun; steps: AgentStep[] }; detail: string }

const STATUS_COLOUR: Record<LoadStatus, string> = {
  en_route: "#1F8BFF", planned: "#94A3B8", rerouted: "#10B981", held: "#F59E0B", delayed: "#EF4444",
  delivered: "#CBD5E1", cancelled: "#CBD5E1",
};
const SEVERITY: Record<string, number> = { minor: 0, moderate: 1, major: 2, critical: 3 };
const IN_FLIGHT: LoadStatus[] = ["planned", "en_route", "delayed", "rerouted", "held"];

const POLL_MS = 8000;

export function DashboardClient({ apiKey, accountName }: { apiKey: string; accountName: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [events, setEvents] = useState<RoadEvent[]>([]);
  const [pending, setPending] = useState<Action[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [latest, setLatest] = useState<{ run: AgentRun; steps: AgentStep[] } | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ title: string; detail: string; proposals: number; summary: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const latestLoaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [s, l, e, a] = await Promise.all([
        api<Stats>("/api/stats"),
        api<{ loads: Load[]; trucks: Truck[] }>("/api/loads"),
        api<{ events: RoadEvent[] }>("/api/events"),
        api<{ actions: Action[] }>("/api/actions?status=proposed"),
      ]);
      setStats(s); setLoads(l.loads); setTrucks(l.trucks); setEvents(e.events); setPending(a.actions);
      setLastRefresh(Date.now());
      setError(null);
      if (!latestLoaded.current) {
        latestLoaded.current = true;
        const r = await api<{ runs: AgentRun[] }>("/api/agents/runs?limit=1");
        if (r.runs[0]) setLatest(await api<{ run: AgentRun; steps: AgentStep[] }>(`/api/agents/runs/${r.runs[0].id}`));
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(e instanceof Error ? e.message : "Refresh failed");
    }
  }, []);

  useEffect(() => {
    refresh();
    api<{ scenarios: Scenario[] }>("/api/scenarios").then((d) => setScenarios(d.scenarios)).catch(() => {});
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(t);
  }, [running]);

  async function runScenario(sc: Scenario) {
    if (running) return;
    setRunning(sc.id); setResult(null); setError(null);
    try {
      const r = await api<ScenarioResult>("/api/scenarios", { method: "POST", body: JSON.stringify({ scenario: sc.id }) });
      const proposals = r.run ? r.run.steps.filter((s) => s.kind === "tool_call" && (s.payload as { risk?: string })?.risk === "propose").length : 0;
      setResult({ title: sc.title, detail: r.detail, proposals, summary: r.run?.run.summary ?? null });
      if (r.run) setLatest(r.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario failed");
    } finally {
      setRunning(null);
      refresh();
    }
  }

  async function decide(id: string, decision: "approve" | "reject") {
    try {
      await api(`/api/actions/${id}`, { method: "POST", body: JSON.stringify({ decision }) });
      setPending((p) => p.filter((a) => a.id !== id));
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Decision failed"); }
  }

  // Map data
  const inFlight = loads.filter((l) => IN_FLIGHT.includes(l.status));
  const routes = inFlight
    .map((l) => ({ polyline: l.currentPolyline ?? l.plannedPolyline, color: STATUS_COLOUR[l.status], label: l.ref, width: l.status === "en_route" || l.status === "rerouted" ? 5 : 3 }))
    .filter((r): r is { polyline: string; color: string; label: string; width: number } => !!r.polyline);
  const markers = trucks.map((t) => ({ id: t.id, lat: t.lat, lon: t.lon, label: t.code }));
  const incidents = events.map((e) => ({ lat: e.lat, lon: e.lon, type: `${e.kind} · ${e.severity}`, description: e.title, criticality: SEVERITY[e.severity] ?? 1 }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Copilot"
        title="Dashboard"
        subtitle={<>{accountName} · {stats ? `${stats.model}${stats.mock ? " · scripted (no API key)" : ""}` : "loading…"}</>}
        right={
          <>
            {lastRefresh && <span className="hidden text-xs text-ink-400 md:inline">Updated {fmtDateTime(lastRefresh)}</span>}
            <Button size="sm" icon={<RefreshCw />} onClick={refresh}>Refresh</Button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Loads in flight" value={stats?.loadsInFlight ?? "—"} sub={`${inFlight.filter((l) => l.status === "en_route").length} en route`} tone="info" />
        <Stat label="Trucks moving" value={stats ? `${stats.trucksMoving} / ${stats.trucks}` : "—"} sub="of fleet" tone="success" />
        <Stat label="Diesel" value={stats?.diesel ? `${stats.diesel.dieselCpl.toFixed(1)} c/L` : "—"} sub={stats?.diesel ? `${stats.diesel.region} · ${stats.diesel.source}` : undefined} tone="warning" />
        <Stat label="Pending approvals" value={stats?.pendingActions ?? "—"} sub={stats ? `${fmtAud(stats.pendingImpactAud)} impact` : undefined} tone={stats && stats.pendingActions > 0 ? "warning" : "neutral"} />
        <Stat label="Agent runs" value={stats?.runs ?? "—"} sub={stats ? `${fmtUsd(stats.totalCostUsd, 3)} total · 24h ${fmtUsd(stats.spend24hUsd, 3)} of ${fmtUsd(stats.caps.dailySpendCapUsd, 2)}` : undefined} />
        <Stat label="Active disruptions" value={stats?.activeEvents ?? "—"} sub={events[0]?.title} tone={stats && stats.activeEvents > 0 ? "danger" : "neutral"} />
      </div>

      {/* Map + side panel */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden">
          <CardHeader className="py-3">
            <CardTitle>Queensland fleet</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
              {(["en_route", "planned", "rerouted", "held", "delayed"] as LoadStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="h-1 w-4 rounded" style={{ background: STATUS_COLOUR[s] }} />
                  {s.replace("_", " ")}
                </span>
              ))}
            </div>
          </CardHeader>
          <div className="p-1.5">
            {apiKey ? (
              <HereMap
                apiKey={apiKey}
                center={{ lat: -22.5, lon: 146 }}
                zoom={5.3}
                height="560px"
                routes={routes}
                markers={markers}
                markerStyle="label"
                incidents={incidents}
              />
            ) : (
              <div className="flex h-[560px] items-center justify-center text-sm text-ink-500">NEXT_PUBLIC_HERE_API_KEY is not set</div>
            )}
          </div>
          <div className="border-t border-ink-100 px-5 py-2.5 text-xs text-ink-500">
            {routes.length} routes drawn · {markers.length} trucks · {incidents.length} active events
          </div>
        </Card>

        <div className="space-y-5">
          {/* Scenarios */}
          <Card>
            <CardHeader>
              <CardTitle>Scenarios</CardTitle>
              <span className="text-[11px] text-ink-400">Each one wakes an agent</span>
            </CardHeader>
            <CardBody className="space-y-2 p-3">
              {scenarios.map((sc) => {
                const isRunning = running === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    disabled={!!running}
                    onClick={() => runScenario(sc)}
                    className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
                      isRunning ? "border-signal-300 bg-signal-50" : "border-ink-200 bg-white hover:bg-ink-50 disabled:opacity-60"
                    }`}
                  >
                    <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${isRunning ? "bg-signal-500 text-white" : "bg-ink-900 text-white"}`}>
                      {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-ink-900">{sc.title}</span>
                        {sc.agent && <Pill tone={sc.agent === "capacity" ? "neutral" : "info"}>{sc.agent}</Pill>}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-ink-500">{sc.blurb}</span>
                      {isRunning && (
                        <span className="mt-1 block text-xs font-medium text-signal-700">
                          {sc.agent ? `${sc.agent} agent is working… ${elapsed}s` : `working… ${elapsed}s`}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              {result && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
                  <div className="font-semibold">{result.title} · done</div>
                  <div className="mt-0.5">{result.detail}</div>
                  {result.summary && <div className="mt-1.5 leading-5">{result.summary}</div>}
                  <div className="mt-1.5 font-semibold">{result.proposals} proposal{result.proposals === 1 ? "" : "s"} raised</div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Pending approvals */}
          <Card>
            <CardHeader>
              <CardTitle>Pending approvals</CardTitle>
              <Link href="/approvals" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-600 hover:text-ink-900">
                All {pending.length} <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {pending.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-ink-400">Nothing waiting. Run a scenario.</div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {pending.slice(0, 5).map((a) => (
                    <li key={a.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Pill tone={a.risk === "high" ? "danger" : a.risk === "medium" ? "warning" : "neutral"}>{a.risk}</Pill>
                            <span className="text-[11px] text-ink-400">{a.agent}</span>
                          </div>
                          <div className="mt-1 text-[13px] font-medium leading-5 text-ink-900">{a.title}</div>
                          {a.impactAud ? <div className="text-xs text-ink-500">{fmtAud(a.impactAud, { sign: true })}{a.kind === "rate_card_update" ? " / week" : " cargo value"}</div> : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => decide(a.id, "approve")} title="Approve" className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700"><Check className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => decide(a.id, "reject")} title="Reject" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Latest run trace */}
      <Card>
        <CardHeader>
          <CardTitle>Latest agent run</CardTitle>
          <Link href="/agents" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-600 hover:text-ink-900">
            All runs <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardBody>
          {latest ? <AgentTrace run={latest.run} steps={latest.steps} /> : (
            <div className="py-4 text-center text-xs text-ink-400">No runs yet. Pick a scenario to see the agent think.</div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
