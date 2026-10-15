import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Card, CardBody, CardHeader, CardTitle, Pill } from "@/components/ui/primitives";

export const metadata = { title: "How it works — Drover" };

export default function AboutPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10 md:py-14">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">How it works</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-900 md:text-4xl">A copilot that proposes, and a dispatcher who decides</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-7 text-ink-600">
          Each agent watches one operational signal. When it fires, the agent reads the fleet's data through typed tools, works
          the numbers with deterministic engines, and writes proposals to an approval queue. Nothing changes a rate card, a route
          or a status until a human approves it, or the policy for low-risk notices does.
        </p>

        {/* Architecture */}
        <Card className="mt-8 overflow-hidden">
          <CardHeader><CardTitle>Architecture</CardTitle><span className="text-[11px] text-ink-400">Next.js 16 · SQLite · OpenAI · HERE</span></CardHeader>
          <CardBody className="overflow-x-auto p-2 md:p-4">
            <Architecture />
          </CardBody>
        </Card>

        {/* Agents */}
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight text-ink-900">The three agents</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <AgentBox name="Fuel agent" tone="success" status="Live model" trigger="A new diesel price observation (ACCC weekly, a feed, or a scenario)."
              body="Reads every customer contract, calls the levy engine per customer, and proposes a rate-card update with the notice drafted only when the implied levy moves at least 0.5 points. Fixed and uncontracted levies are flagged, not changed." />
            <AgentBox name="Disruption agent" tone="success" status="Live model" trigger="A new road or weather event of moderate severity or worse."
              body="Finds in-flight loads whose route crosses the event, plans a truck-legal HERE detour around it, then decides per load: proceed, reroute, hold or escalate. Essential and perishable freight is never silently held." />
            <AgentBox name="Capacity agent" tone="neutral" status="Phase 2, rules only" trigger="A driver or truck becomes unavailable, or a load has no truck."
              body="Lists uncovered loads and idle trucks, checks HVNL standard hours per candidate, and proposes the nearest legal reassignment or escalates. Designed in full; this POC runs the rules without a model." />
          </div>
        </section>

        {/* Governance */}
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight text-ink-900">Governance rules</h2>
          <Card className="mt-4">
            <CardBody>
              <ul className="grid gap-x-8 gap-y-3 text-[14px] leading-6 text-ink-700 md:grid-cols-2">
                <Rule t="Read or propose, never execute">Every tool is rated read or propose. The executor is the only code path that changes data, and it runs fixed logic per action kind.</Rule>
                <Rule t="Pinned model, exact cost">One pinned model id per deployment. Tokens are priced per call from the usage report, so the cost meter is measured, not estimated.</Rule>
                <Rule t="Hard caps in the runtime">A step cap, a per-run cost cap and a rolling 24-hour spend cap, all enforced in code and logged as guardrail steps when they trip.</Rule>
                <Rule t="Schema-checked arguments">Tool arguments are validated against the tool's JSON schema before the handler runs. A bad call is refused and the model is told why.</Rule>
                <Rule t="Auto-execute only low risk">Customer notices and review flags execute at proposal time. Rate-card changes, re-routes, holds and reassignments wait for a dispatcher.</Rule>
                <Rule t="Full trace, every run">Every system message, thought, tool call, result, guardrail and final summary is written to the database as it happens, and shown unedited in the UI.</Rule>
                <Rule t="Evals on the decision rules">The disruption rules and the levy engine have fixed test cases; the evals page shows the latest pass rate, latency and cost per suite.</Rule>
                <Rule t="Scripted fallback">With no API key, each agent runs a scripted plan over the same tools and data, so the UI, trace and approval flow behave identically.</Rule>
              </ul>
            </CardBody>
          </Card>
        </section>

        {/* Data sources */}
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight text-ink-900">Data sources, honestly</h2>
          <Card className="mt-4 overflow-hidden">
            <table className="w-full text-[14px]">
              <thead className="border-b border-ink-100 bg-ink-50 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                <tr><th className="px-4 py-2 text-left">Source</th><th className="px-4 py-2 text-left">Used for</th><th className="px-4 py-2 text-left">Status in this POC</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-ink-700">
                <Src s="Brisbane fleet, customers, loads" u="Trucks, contracts, in-flight loads" status="Seeded" note="Fictional operator with realistic Queensland lanes and contract terms." tone="neutral" />
                <Src s="Diesel prices" u="Fuel agent trigger and levy engine" status="Referenced" note="Seeded from ACCC-referenced 2026 Queensland retail levels; scenario shocks are simulated." tone="warning" />
                <Src s="Road closures" u="Disruption agent trigger" status="Seeded / simulated" note="2026 Bruce and Stuart highway closures seeded from public reports; the QLDTraffic adapter exists but scenarios inject events directly." tone="warning" />
                <Src s="HERE truck routing" u="Planned routes, detours, truck restrictions, map tiles" status="Live" note="Real truck profiles (height, mass, axles) with avoid-areas for active events." tone="success" />
                <Src s="Open-Meteo" u="Weather samples along a route" status="Live" note="Rain and wind gusts sampled at points along the polyline." tone="success" />
                <Src s="BoM warnings" u="Weather-event trigger" status="Designed" note="Adapter stubbed; no live feed wired in this POC." tone="neutral" />
                <Src s="OpenAI model" u="Fuel and disruption agent reasoning" status="Live, pinned" note="Falls back to the scripted plan when no key is configured." tone="success" />
              </tbody>
            </table>
          </Card>
        </section>

        {/* Limitations */}
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight text-ink-900">Limitations</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-[14px] leading-6 text-ink-700">
            <li>Single operator, single SQLite file. No multi-tenant isolation beyond the account id on every row.</li>
            <li>Truck positions are seeded and nudged by scenarios; there is no telematics or EWD feed, so fatigue hours are derived from truck status.</li>
            <li>Customer notices are logged, not sent. Approving a rate-card change updates the contract row; it does not touch an invoicing system.</li>
            <li>The capacity agent runs rules only. Trade-offs the rules cannot rank (customer priority, backhaul value, subcontractor cost) are the Phase 2 model's job.</li>
            <li>Evals cover decision rules and the levy engine with fixed cases; they do not yet score the quality of the model's prose summaries.</li>
            <li>Rate limits and caps are per process; a restart resets the in-memory limiter.</li>
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}

function AgentBox({ name, status, tone, trigger, body }: { name: string; status: string; tone: "success" | "neutral"; trigger: string; body: string }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between"><div className="text-sm font-semibold text-ink-900">{name}</div><Pill tone={tone}>{status}</Pill></div>
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">Trigger</div>
        <div className="mt-0.5 text-[13px] text-ink-700">{trigger}</div>
        <p className="mt-3 text-[13px] leading-6 text-ink-600">{body}</p>
      </CardBody>
    </Card>
  );
}

function Rule({ t, children }: { t: string; children: React.ReactNode }) {
  return <li><span className="font-semibold text-ink-900">{t}.</span> {children}</li>;
}

function Src({ s, u, status, note, tone }: { s: string; u: string; status: string; note: string; tone: "success" | "warning" | "neutral" }) {
  return (
    <tr>
      <td className="px-4 py-2.5 font-medium text-ink-900">{s}</td>
      <td className="px-4 py-2.5">{u}</td>
      <td className="px-4 py-2.5"><Pill tone={tone}>{status}</Pill><div className="mt-1 text-xs text-ink-500">{note}</div></td>
    </tr>
  );
}

/** Inline SVG architecture diagram. */
function Architecture() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub?: string, fill = "#FFFFFF", stroke = "#CBD5E1") => (
    <g key={title}>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={fill} stroke={stroke} strokeWidth="1.5" />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 4 : h / 2 + 4)} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0F172A" fontFamily="system-ui, sans-serif">{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize="10" fill="#64748B" fontFamily="system-ui, sans-serif">{sub}</text>}
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, dashed = false) => (
    <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748B" strokeWidth="1.5" markerEnd="url(#arr)" strokeDasharray={dashed ? "4 3" : undefined} />
  );
  return (
    <svg viewBox="0 0 860 330" className="mx-auto w-full max-w-[860px] min-w-[640px]" role="img" aria-label="Architecture: Dispatcher UI to Next.js API to agent runtime to OpenAI model; tools read SQLite, HERE, Open-Meteo, QLDTraffic and BoM; proposals go to an approval queue and an executor">
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748B" /></marker>
      </defs>
      {/* Main flow */}
      {box(10, 30, 150, 54, "Dispatcher UI", "Next.js App Router")}
      {box(220, 30, 150, 54, "Next.js API", "cookie session, rate limits")}
      {box(430, 30, 150, 54, "Agent runtime", "loop, caps, schema checks", "#EAF3FF", "#73ABFF")}
      {box(640, 30, 150, 54, "OpenAI model", "pinned id, priced per call")}
      {arrow(160, 57, 220, 57)}
      {arrow(370, 57, 430, 57)}
      {arrow(580, 57, 640, 57)}
      {arrow(640, 70, 580, 70)}

      {/* Tools */}
      <text x="505" y="120" textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748B" fontFamily="system-ui, sans-serif" letterSpacing="1">TOOLS · READ</text>
      {arrow(505, 84, 505, 108, true)}
      {box(230, 132, 100, 44, "SQLite", "fleet, contracts")}
      {box(340, 132, 100, 44, "HERE", "truck routing")}
      {box(450, 132, 100, 44, "Open-Meteo", "weather")}
      {box(560, 132, 100, 44, "QLDTraffic", "road events")}
      {box(670, 132, 100, 44, "BoM", "warnings")}
      {[280, 390, 500, 610, 720].map((x) => arrow(505, 110, x, 132, true))}

      {/* Proposals */}
      <text x="135" y="120" textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748B" fontFamily="system-ui, sans-serif" letterSpacing="1">TOOLS · PROPOSE</text>
      {arrow(430, 84, 150, 130, true)}
      {box(60, 132, 150, 44, "Approval queue", "actions table", "#FFFBEB", "#F59E0B")}
      {arrow(135, 176, 135, 215)}
      {box(60, 215, 150, 44, "Executor", "deterministic per kind", "#ECFDF5", "#10B981")}
      {arrow(210, 237, 280, 176)}
      <text x="150" y="200" fontSize="10" fill="#64748B" fontFamily="system-ui, sans-serif">dispatcher approves</text>
      <text x="150" y="211" fontSize="10" fill="#64748B" fontFamily="system-ui, sans-serif">(low risk auto)</text>

      {/* Trace */}
      {box(430, 240, 150, 44, "Trace & cost meter", "agent_runs, agent_steps")}
      {arrow(505, 176, 505, 240, true)}
      {box(640, 240, 150, 44, "Evals", "eval_runs")}
      {arrow(580, 262, 640, 262, true)}
      <text x="430" y="315" fontSize="10" fill="#94A3B8" fontFamily="system-ui, sans-serif">Dashed: read-only. Solid: a state change, only via the executor.</text>
    </svg>
  );
}
