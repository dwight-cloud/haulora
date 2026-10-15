"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Check, Fuel, Loader2, RefreshCw, RotateCcw, TriangleAlert, Users, X,
} from "lucide-react";
import { HereMap } from "@/components/HereMap";
import { RunStory } from "@/components/RunStory";
import { Button, Card, CardBody, CardHeader, CardTitle, ErrorBanner, PageHeader, Pill, Stat, cx } from "@/components/ui/primitives";
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
type RunBundle = { run: AgentRun; steps: AgentStep[] };

const STATUS_COLOUR: Record<LoadStatus, string> = {
  en_route: "#2563EB", planned: "#8A8780", rerouted: "#178A6E", held: "#D97706", delayed: "#DC2626",
  delivered: "#CFC8BD", cancelled: "#CFC8BD",
};
const STATUS_LABEL: Record<LoadStatus, string> = {
  en_route: "En route", planned: "Planned", rerouted: "Rerouted", held: "Held", delayed: "Delayed", delivered: "Delivered", cancelled: "Cancelled",
};
const STATUS_TONE: Record<LoadStatus, "info" | "neutral" | "success" | "warning" | "danger"> = {
  en_route: "info", planned: "neutral", rerouted: "success", held: "warning", delayed: "danger", delivered: "neutral", cancelled: "neutral",
};
const SEVERITY: Record<string, number> = { minor: 0, moderate: 1, major: 2, critical: 3 };
const IN_FLIGHT: LoadStatus[] = ["planned", "en_route", "delayed", "rerouted", "held"];
const AFFECTED: LoadStatus[] = ["delayed", "rerouted", "held"];

/** Plain-English framing for each scenario; falls back to the API's own title. */
const SCENARIO_COPY: Record<string, { title: string; blurb: string; icon: React.ReactNode }> = {
  diesel_spike: { title: "Diesel jumps 40 c/L", blurb: "A fuel shock lands. Who should pay more, and how much?", icon: <Fuel /> },
  bruce_cut:    { title: "A flood closes the Bruce Highway", blurb: "Trucks are heading into the closure. Reroute, wait, or call the customer?", icon: <TriangleAlert /> },
  drivers_sick: { title: "Two drivers call in sick", blurb: "Loads have no driver. Who can legally cover them today?", icon: <Users /> },
  reset:        { title: "Start again", blurb: "Clear the shocks and put the fleet back how it was. Keeps the history.", icon: <RotateCcw /> },
};

const KIND_LABEL: Record<string, string> = {
  rate_card_update: "Rate card", replan_load: "Re-route", hold_load: "Hold", flag_for_review: "Needs a human", customer_notice: "Customer notice", reassign_load: "Reassignment",
};

/** Rough subscription price used only to put a recovered amount in context. */
const SUBSCRIPTION_AUD_PER_TRUCK_MONTH = 149;
const WEEKS_PER_MONTH = 52 / 12;
const POLL_MS = 8000;
const MAP_TIMEOUT_MS = 8000;
const INTRO_KEY = "haulio.intro.dismissed";

export function DashboardClient({ apiKey, accountName }: { apiKey: string; accountName: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [events, setEvents] = useState<RoadEvent[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [latest, setLatest] = useState<RunBundle | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ title: string; detail: string; proposals: number; summary: string | null; costUsd: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const latestLoaded = useRef(false);

  useEffect(() => {
    try { if (localStorage.getItem(INTRO_KEY) === "1") setShowIntro(false); } catch { /* private mode */ }
  }, []);
  function dismissIntro() {
    setShowIntro(false);
    try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* ignore */ }
  }

  const refresh = useCallback(async () => {
    try {
      const [s, l, e, a] = await Promise.all([
        api<Stats>("/api/stats"),
        api<{ loads: Load[]; trucks: Truck[] }>("/api/loads"),
        api<{ events: RoadEvent[] }>("/api/events"),
        api<{ actions: Action[] }>("/api/actions"),
      ]);
      setStats(s); setLoads(l.loads); setTrucks(l.trucks); setEvents(e.events); setActions(a.actions);
      setLastRefresh(Date.now()); setDataLoaded(true);
      setError(null);
      if (!latestLoaded.current) {
        latestLoaded.current = true;
        const r = await api<{ runs: AgentRun[] }>("/api/agents/runs?limit=1");
        if (r.runs[0]) setLatest(await api<RunBundle>(`/api/agents/runs/${r.runs[0].id}`));
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
      setResult({ title: SCENARIO_COPY[sc.id]?.title ?? sc.title, detail: r.detail, proposals, summary: r.run?.run.summary ?? null, costUsd: r.run?.run.costUsd ?? 0 });
      if (r.run) setLatest(r.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario failed");
    } finally {
      setRunning(null);
      refresh();
    }
  }

  async function decide(id: string, decision: "approve" | "reject") {
    setDeciding(id); setError(null);
    try {
      const r = await api<{ action: Action }>(`/api/actions/${id}`, { method: "POST", body: JSON.stringify({ decision }) });
      setActions((xs) => xs.map((a) => (a.id === id ? r.action : a)));
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Decision failed"); }
    finally { setDeciding(null); }
  }

  // Derived
  const pending = actions.filter((a) => a.status === "proposed");
  const inFlight = loads.filter((l) => IN_FLIGHT.includes(l.status));
  const affected = inFlight.filter((l) => AFFECTED.includes(l.status));
  const runActions = latest ? actions.filter((a) => a.runId === latest.run.id) : [];
  const routes = inFlight
    .map((l) => ({
      polyline: l.currentPolyline ?? l.plannedPolyline, color: STATUS_COLOUR[l.status], label: l.ref,
      width: AFFECTED.includes(l.status) ? 7 : l.status === "en_route" ? 4 : 2,
    }))
    .filter((r): r is { polyline: string; color: string; label: string; width: number } => !!r.polyline);
  const affectedTruckIds = new Set(affected.map((l) => l.truckId).filter(Boolean));
  const markers = trucks.map((t) => ({ id: t.id, lat: t.lat, lon: t.lon, label: affectedTruckIds.has(t.id) ? `▲ ${t.code}` : t.code }));
  const incidents = events.map((e) => ({ lat: e.lat, lon: e.lon, type: `${e.kind} · ${e.severity}`, description: e.title, criticality: SEVERITY[e.severity] ?? 1 }));
  const runningScenario = scenarios.find((s) => s.id === running);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dispatcher view"
        title="Dashboard"
        subtitle={<>{accountName} · {stats ? (stats.mock ? "scripted plan, no model key" : "live model") : "loading…"}</>}
        right={
          <>
            {lastRefresh && <span className="hidden text-xs text-bitumen-400 md:inline">Updated {fmtDateTime(lastRefresh)}</span>}
            <Button size="sm" icon={<RefreshCw />} onClick={refresh}>Refresh</Button>
          </>
        }
      />

      {showIntro && (
        <Card className="border-rust-200 bg-rust-50/60">
          <CardBody className="relative">
            <button type="button" onClick={dismissIntro} aria-label="Dismiss" className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-md text-bitumen-500 hover:bg-white hover:text-bitumen-900 md:h-8 md:w-8">
              <X className="h-4 w-4" />
            </button>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h2 className="text-base font-semibold text-bitumen-900">What is Haulio?</h2>
                <p className="mt-1.5 text-[14px] leading-6 text-bitumen-700">
                  Haulio is an AI dispatcher's assistant for a trucking company. When fuel prices move, a road closes or a driver
                  is unavailable, an agent reads the fleet's data, works out what to do and writes up a proposal. Nothing changes
                  until a person approves it.
                </p>
              </div>
              <div>
                <h2 className="text-base font-semibold text-bitumen-900">What to click</h2>
                <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[14px] leading-6 text-bitumen-700">
                  <li>Pick something that goes wrong in Step 1.</li>
                  <li>Watch the agent work in Step 2 (about 20 seconds).</li>
                  <li>Approve or reject its proposals in Step 3.</li>
                  <li>See what changed, in dollars, in Step 4.</li>
                </ol>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Right now */}
      <section aria-label="Right now">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat loading={!dataLoaded} label="On the road" value={stats?.loadsInFlight ?? "—"} sub={`${inFlight.filter((l) => l.status === "en_route").length} moving now`} tone="info" />
          <Stat loading={!dataLoaded} label="Trucks moving" value={stats ? `${stats.trucksMoving} / ${stats.trucks}` : "—"} sub="of the fleet" tone="success" />
          <Stat loading={!dataLoaded} label="Diesel today" value={stats?.diesel ? `${stats.diesel.dieselCpl.toFixed(1)} c/L` : "—"} sub={stats?.diesel ? `${stats.diesel.region} · ${stats.diesel.source}` : "no price yet"} tone="warning" />
          <Stat loading={!dataLoaded} label="Waiting for you" value={stats?.pendingActions ?? "—"} sub={stats ? `${fmtAud(stats.pendingImpactAud)} at stake` : undefined} tone={stats && stats.pendingActions > 0 ? "accent" : "neutral"} />
          <Stat loading={!dataLoaded} label="Agent runs" value={stats?.runs ?? "—"} sub={stats ? `${fmtUsd(stats.totalCostUsd, 3)} spent in total` : undefined} />
          <Stat loading={!dataLoaded} label="Road problems" value={stats?.activeEvents ?? "—"} sub={events[0]?.title ?? "none active"} tone={stats && stats.activeEvents > 0 ? "danger" : "neutral"} />
        </div>
      </section>

      {/* Step 1 */}
      <StepSection n={1} title="Pick what goes wrong" lead="Each button is a shock to the business. Pressing one wakes the agent that handles it.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {scenarios.map((sc) => {
            const copy = SCENARIO_COPY[sc.id];
            const isRunning = running === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                disabled={!!running}
                onClick={() => runScenario(sc)}
                aria-busy={isRunning}
                className={cx(
                  "flex min-h-[132px] flex-col items-start rounded-xl border p-4 text-left transition disabled:cursor-not-allowed",
                  isRunning ? "border-rust-400 bg-rust-50 shadow-glow" : "border-bitumen-200 bg-white hover:border-rust-300 hover:shadow-card-lg disabled:opacity-60",
                  sc.id === "reset" && !isRunning ? "bg-bitumen-50" : ""
                )}
              >
                <span className={cx("inline-flex h-10 w-10 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5", isRunning ? "bg-rust-500 text-white" : sc.id === "reset" ? "bg-bitumen-200 text-bitumen-700" : "bg-rust-50 text-rust-600")}>
                  {isRunning ? <Loader2 className="animate-spin" /> : copy?.icon ?? <Fuel />}
                </span>
                <span className="mt-3 text-[15px] font-semibold leading-5 text-bitumen-900">{copy?.title ?? sc.title}</span>
                <span className="mt-1 text-[13px] leading-5 text-bitumen-500">{copy?.blurb ?? sc.blurb}</span>
              </button>
            );
          })}
          {scenarios.length === 0 && [0, 1, 2, 3].map((i) => <div key={i} className="min-h-[132px] animate-pulse rounded-xl border border-bitumen-200 bg-bitumen-50" />)}
        </div>

        {running && (
          <div role="status" className="mt-3 flex items-center gap-3 rounded-xl border border-rust-200 bg-rust-50 px-4 py-3 text-sm text-rust-900">
            <Loader2 className="h-4 w-4 animate-spin text-rust-600" />
            <span>
              <span className="font-semibold">{runningScenario?.agent ? `The ${runningScenario.agent} agent is working` : "Working"}…</span>
              {" "}{elapsed}s elapsed. It is reading the fleet, running the numbers and writing proposals.
            </span>
          </div>
        )}
        {result && !running && (
          <div className="mt-3 rounded-xl border border-gum-200 bg-gum-50 p-4 text-sm text-gum-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{result.title}: done</div>
              <div className="flex items-center gap-2 text-xs">
                <Pill tone="success" filled>{result.proposals} proposal{result.proposals === 1 ? "" : "s"}</Pill>
                <Pill tone="neutral">cost {fmtUsd(result.costUsd)}</Pill>
              </div>
            </div>
            {result.summary && <p className="mt-2 leading-6">{result.summary.split(/\n{2,}/)[0]}</p>}
            {!result.summary && <p className="mt-2 leading-6">{result.detail}</p>}
            <a href="#step-3" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-gum-800 hover:text-gum-900">Go to Step 3 and decide <ArrowUpRight className="h-3.5 w-3.5" /></a>
          </div>
        )}
      </StepSection>

      {/* Step 2 */}
      <StepSection n={2} title="Watch the agent work" lead="Every line is one thing the agent did, in order. It can read and propose, but it cannot change anything itself.">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardBody>
              {latest ? <RunStory run={latest.run} steps={latest.steps} compact /> : running ? (
                <div className="py-6 text-center text-sm text-bitumen-500">The agent is working. Its steps will appear here when it finishes.</div>
              ) : (
                <div className="py-6 text-center text-sm text-bitumen-500">Nothing has run yet. Pick something that goes wrong in Step 1.</div>
              )}
            </CardBody>
          </Card>
          <MapPanel apiKey={apiKey} loaded={dataLoaded} routes={routes} markers={markers} incidents={incidents} inFlight={inFlight} affected={affected} />
        </div>
      </StepSection>

      {/* Step 3 */}
      <StepSection n={3} id="step-3" title="Decide" lead="These are the agent's proposals. Nothing happens until you approve. Low-risk notices are already in the queue for you to send.">
        {pending.length === 0 ? (
          <Card>
            <CardBody className="py-8 text-center text-sm text-bitumen-500">
              {dataLoaded ? "Nothing is waiting for a decision. Run something in Step 1, or see past decisions on the " : "Loading…"}
              {dataLoaded && <Link href="/approvals" className="font-semibold text-rust-700 hover:underline">approvals page</Link>}
              {dataLoaded && "."}
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pending.map((a) => <DecisionCard key={a.id} a={a} busy={deciding === a.id} onDecide={decide} />)}
          </div>
        )}
        {actions.length > pending.length && (
          <div className="mt-2 text-xs text-bitumen-500">
            <Link href="/approvals" className="inline-flex items-center gap-1 font-semibold text-bitumen-700 hover:text-bitumen-900">All decisions, past and present <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
        )}
      </StepSection>

      {/* Step 4 */}
      <StepSection n={4} title="What changed" lead="The outcome of the last run, in money and plain words.">
        <Outcome run={latest?.run ?? null} runActions={runActions} loads={loads} />
      </StepSection>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-bitumen-200 pt-4 text-xs text-bitumen-500">
        <span className="font-semibold uppercase tracking-[0.12em] text-bitumen-400">For engineers</span>
        <Link href="/agents" className="hover:text-bitumen-900">Agents, tools and every run</Link>
        <Link href="/evals" className="hover:text-bitumen-900">Evals and cost</Link>
        <Link href="/about" className="hover:text-bitumen-900">Architecture and data sources</Link>
      </div>
    </div>
  );
}

// -------- Sections --------

function StepSection({ n, title, lead, children, id }: { n: number; title: string; lead: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} aria-labelledby={`step-${n}-title`} className="scroll-mt-20">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bitumen-900 text-[13px] font-bold text-white">{n}</span>
        <div>
          <h2 id={`step-${n}-title`} className="text-lg font-bold tracking-tight text-bitumen-900">{title}</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-bitumen-500">{lead}</p>
        </div>
      </div>
      <div className="mt-3 md:ml-11">{children}</div>
    </section>
  );
}

// -------- Map panel --------

function MapPanel({
  apiKey, loaded, routes, markers, incidents, inFlight, affected,
}: {
  apiKey: string; loaded: boolean;
  routes: { polyline: string; color: string; label: string; width: number }[];
  markers: { id: string; lat: number; lon: number; label: string }[];
  incidents: { lat: number; lon: number; type: string; description: string; criticality: number }[];
  inFlight: Load[]; affected: Load[];
}) {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (ready || !apiKey) return;
    const t = setTimeout(() => setTimedOut(true), MAP_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready, apiKey]);

  const caption = affected.length
    ? `${affected.map((l) => l.ref).join(", ")} ${affected.length === 1 ? "is" : "are"} affected and drawn thicker; the truck carrying ${affected.length === 1 ? "it" : "them"} is marked ▲.`
    : `${inFlight.length} loads on Queensland roads, ${markers.length} trucks. Nothing is affected right now.`;

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle>Where the trucks are</CardTitle>
        <span className="text-[11px] text-bitumen-400">HERE truck routing, live</span>
      </CardHeader>
      <div className="relative p-1.5" style={{ minHeight: 332 }}>
        {!loaded && <div className="absolute inset-1.5 z-10 animate-pulse rounded-xl bg-bitumen-100" aria-hidden />}
        {apiKey && !(timedOut && !ready) ? (
          <HereMap
            apiKey={apiKey}
            center={{ lat: -22.5, lon: 146 }}
            zoom={4.8}
            height="320px"
            routes={routes}
            markers={markers}
            markerStyle="label"
            incidents={incidents}
            onReady={() => setReady(true)}
          />
        ) : (
          <div className="flex h-[320px] items-center justify-center rounded-xl bg-bitumen-50 px-6 text-center text-sm text-bitumen-500">
            {apiKey ? "Map tiles unavailable in this browser; routes are listed below." : "Map key not configured; routes are listed below."}
          </div>
        )}
      </div>
      <p className="border-t border-bitumen-100 px-4 py-2.5 text-[12px] leading-5 text-bitumen-600">{caption}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-bitumen-100 px-4 py-2 text-[11px] text-bitumen-500">
        {(["en_route", "planned", "rerouted", "held", "delayed"] as LoadStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="h-1 w-4 rounded" style={{ background: STATUS_COLOUR[s] }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Road problem</span>
      </div>
      {inFlight.length > 0 && (
        <ul className="max-h-48 divide-y divide-bitumen-100 overflow-y-auto border-t border-bitumen-100 text-[12px]">
          {[...affected, ...inFlight.filter((l) => !AFFECTED.includes(l.status))].slice(0, 12).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-1.5">
              <span className="min-w-0 truncate"><span className="font-mono font-semibold text-bitumen-800">{l.ref}</span> <span className="text-bitumen-500">{l.originLabel.split(" (")[0]} → {l.destLabel.split(" (")[0]}</span></span>
              <Pill tone={STATUS_TONE[l.status]} filled>{STATUS_LABEL[l.status]}</Pill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// -------- Decision card --------

function ifApproved(a: Action, data: Record<string, unknown>): string {
  switch (a.kind) {
    case "rate_card_update": return `The customer's fuel levy moves from ${Number(data.oldLevyPct).toFixed(1)}% to ${Number(data.newLevyPct).toFixed(1)}% from ${String(data.effectiveDate ?? "the effective date")}, and the drafted notice is ready to send.`;
    case "replan_load": return `The truck takes the detour (${Number(data.km).toFixed(0)} km, ${Number(data.hours).toFixed(1)} h) and the customer is told the new arrival time.`;
    case "hold_load": return "The load waits where it is until the road reopens, and the customer is told.";
    case "flag_for_review": return "Nothing moves on its own. It is marked as seen and you take it from here, usually a phone call.";
    case "customer_notice": return "The notice is logged as sent to the customer.";
    case "reassign_load": return "The load moves onto the other truck and the driver's plan is updated.";
    default: return "The change is applied by the executor exactly as written.";
  }
}

function DecisionCard({ a, busy, onDecide }: { a: Action; busy: boolean; onDecide: (id: string, d: "approve" | "reject") => void }) {
  const payload = (a.payload as { kind?: string; data?: Record<string, unknown> } | null) ?? {};
  const data = payload.data ?? {};
  const riskTone = a.risk === "high" ? "danger" : a.risk === "medium" ? "warning" : "success";
  const impactLabel = a.kind === "rate_card_update" ? "per week" : a.impactAud ? "cargo value" : "";
  return (
    <Card className="flex flex-col">
      <CardBody className="flex flex-1 flex-col p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="neutral">{a.agent} agent</Pill>
          <Pill tone="neutral">{KIND_LABEL[a.kind] ?? a.kind}</Pill>
          <Pill tone={riskTone} filled>{a.risk} risk</Pill>
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="text-[15px] font-semibold leading-6 text-bitumen-900">{a.title}</div>
          {a.impactAud ? (
            <div className="shrink-0 text-right">
              <div className="text-xl font-bold tracking-tight text-bitumen-900 tabular-nums">{fmtAud(a.impactAud, { sign: a.kind === "rate_card_update" })}</div>
              <div className="text-[11px] text-bitumen-400">{impactLabel}</div>
            </div>
          ) : null}
        </div>
        {a.description && <p className="mt-1 text-[13px] leading-6 text-bitumen-600">{a.description}</p>}
        {a.kind === "rate_card_update" && <LevyBar oldPct={Number(data.oldLevyPct)} newPct={Number(data.newLevyPct)} />}
        <div className="mt-3 rounded-lg bg-bitumen-50 px-3 py-2 text-[13px] leading-5 text-bitumen-700">
          <span className="font-semibold text-bitumen-900">If you approve:</span> {ifApproved(a, data)}
        </div>
        <div className="mt-4 flex gap-2">
          <Button tone="accent" className="flex-1" disabled={busy} icon={busy ? <Loader2 className="animate-spin" /> : <Check />} onClick={() => onDecide(a.id, "approve")}>Approve</Button>
          <Button className="flex-1" disabled={busy} icon={<X />} onClick={() => onDecide(a.id, "reject")}>Reject</Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function LevyBar({ oldPct, newPct }: { oldPct: number; newPct: number }) {
  const max = Math.max(oldPct, newPct, 1) * 1.15;
  return (
    <div className="mt-3 space-y-1.5 text-[12px]">
      {[{ l: "Now", v: oldPct, c: "bg-bitumen-300" }, { l: "Proposed", v: newPct, c: "bg-rust-500" }].map((r) => (
        <div key={r.l} className="grid grid-cols-[64px_1fr_48px] items-center gap-2">
          <span className="text-bitumen-500">{r.l}</span>
          <span className="h-2 overflow-hidden rounded-full bg-bitumen-100"><span className={`block h-full rounded-full ${r.c}`} style={{ width: `${Math.min(100, (r.v / max) * 100)}%` }} /></span>
          <span className="text-right font-semibold text-bitumen-800 tabular-nums">{r.v.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// -------- Outcome --------

function statusWord(s: Action["status"]): string {
  switch (s) {
    case "proposed": return "waiting for you";
    case "approved": case "executed": return "approved";
    case "auto_executed": return "sent automatically";
    case "rejected": return "rejected";
    case "failed": return "failed";
  }
}

function outcomeLine(a: Action, loads: Load[]): string {
  const data = ((a.payload as { data?: Record<string, unknown> } | null)?.data) ?? {};
  const ref = String(a.title.split(":")[0] ?? "");
  const load = loads.find((l) => l.ref === ref);
  switch (a.kind) {
    case "rate_card_update": return `${a.title.replace(/^Levy for |^Rate card: /, "")}: levy ${Number(data.oldLevyPct).toFixed(1)}% → ${Number(data.newLevyPct).toFixed(1)}%, ${fmtAud(a.impactAud, { sign: true })} a week, ${statusWord(a.status)}.`;
    case "replan_load": return `${ref} re-routed: ${Number(data.km).toFixed(0)} km, ${Number(data.hours).toFixed(1)} h, ${fmtAud(a.impactAud)} of cargo kept moving, ${statusWord(a.status)}.`;
    case "hold_load": return `${ref} held${load ? ` at ${load.originLabel.split(" (")[0]}` : ""} until the road clears, ${statusWord(a.status)}.`;
    case "flag_for_review": return a.agent === "disruption"
      ? `${ref} escalated: a human must choose between a late delivery and a rebook (${fmtAud(a.impactAud)} of cargo), ${statusWord(a.status)}.`
      : `${a.title}, ${statusWord(a.status)}.`;
    case "customer_notice": return `Customer told about ${String(data.subject ?? "").replace("Update on consignment ", "")}, ${statusWord(a.status)}.`;
    case "reassign_load": return `${a.title}, ${statusWord(a.status)}.`;
    default: return `${a.title}, ${statusWord(a.status)}.`;
  }
}

function Outcome({ run, runActions, loads }: { run: AgentRun | null; runActions: Action[]; loads: Load[] }) {
  if (!run) return <Card><CardBody className="py-8 text-center text-sm text-bitumen-500">Nothing has run yet.</CardBody></Card>;
  const live = runActions.filter((a) => a.status !== "rejected" && a.status !== "failed");
  const rate = live.filter((a) => a.kind === "rate_card_update");
  const weekly = rate.reduce((s, a) => s + (a.impactAud || 0), 0);
  const approvedWeekly = rate.filter((a) => a.status === "approved" || a.status === "executed").reduce((s, a) => s + (a.impactAud || 0), 0);
  const cargo = live.filter((a) => a.agent !== "fuel" && a.kind !== "customer_notice").reduce((s, a) => s + (a.impactAud || 0), 0);
  const trucksEq = Math.round((weekly * WEEKS_PER_MONTH) / SUBSCRIPTION_AUD_PER_TRUCK_MONTH);
  const humans = live.filter((a) => a.kind === "flag_for_review").length;
  const waiting = runActions.filter((a) => a.status === "proposed").length;

  return (
    <Card>
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-3">
          {rate.length > 0 && (
            <Headline value={fmtAud(weekly, { sign: true })} label="per week" sub={`across ${rate.length} customer${rate.length === 1 ? "" : "s"}${trucksEq > 0 ? `, about ${trucksEq} truck${trucksEq === 1 ? "'s" : "s'"} monthly subscription` : ""}`} tone="rust" />
          )}
          {rate.length > 0 && (
            <Headline value={fmtAud(approvedWeekly, { sign: true })} label="per week approved so far" sub={waiting ? `${waiting} still waiting for you` : "everything decided"} tone="gum" />
          )}
          {cargo > 0 && <Headline value={fmtAud(cargo)} label="of cargo protected" sub="kept moving, held safely or escalated" tone="gum" />}
          {humans > 0 && <Headline value={String(humans)} label={`load${humans === 1 ? "" : "s"} need${humans === 1 ? "s" : ""} a human`} sub="the agent stopped and asked" tone="amber" />}
          <Headline value={fmtUsd(run.costUsd, 3)} label="model cost for this run" sub={`${run.toolCalls} tool calls, ${run.finishedAt ? ((run.finishedAt - run.startedAt) / 1000).toFixed(0) : "—"} s`} tone="neutral" />
        </div>
        <ul className="mt-4 space-y-1.5 text-[14px] leading-6 text-bitumen-800">
          {runActions.length === 0 && <li className="text-bitumen-500">This run made no proposals.</li>}
          {runActions.map((a) => <li key={a.id} className="flex gap-2"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-bitumen-400" aria-hidden />{outcomeLine(a, loads)}</li>)}
        </ul>
        {trucksEq > 0 && <p className="mt-3 text-[11px] text-bitumen-400">Subscription comparison assumes A${SUBSCRIPTION_AUD_PER_TRUCK_MONTH} a truck a month.</p>}
      </CardBody>
    </Card>
  );
}

function Headline({ value, label, sub, tone }: { value: string; label: string; sub?: string; tone: "rust" | "gum" | "amber" | "neutral" }) {
  const c = tone === "rust" ? "text-rust-600" : tone === "gum" ? "text-gum-600" : tone === "amber" ? "text-amber-700" : "text-bitumen-900";
  return (
    <div className="rounded-lg border border-bitumen-200 bg-bitumen-50 px-4 py-3">
      <div className={`text-2xl font-bold tracking-tight tabular-nums ${c}`}>{value}</div>
      <div className="text-[13px] font-medium text-bitumen-800">{label}</div>
      {sub && <div className="mt-0.5 text-[12px] text-bitumen-500">{sub}</div>}
    </div>
  );
}
