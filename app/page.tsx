import Link from "next/link";
import { Fuel, TriangleAlert, Users, ArrowRight } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DemoButton } from "@/components/DemoButton";
import { Pill } from "@/components/ui/primitives";

const AGENTS = [
  {
    icon: <Fuel />, name: "Fuel agent", status: "Live model" as const,
    trigger: "diesel price moves",
    decision: "what each customer's levy should be",
    action: "proposes rate-card updates with the notice drafted",
    metric: "A$ recovered per week",
  },
  {
    icon: <TriangleAlert />, name: "Disruption agent", status: "Live model" as const,
    trigger: "road or weather event",
    decision: "reroute, hold, proceed or escalate per load",
    action: "proposes truck-legal detours and holds",
    metric: "cargo value protected, hours saved",
  },
  {
    icon: <Users />, name: "Capacity agent", status: "Phase 2, rules only" as const,
    trigger: "driver or truck unavailable",
    decision: "which idle truck can legally cover",
    action: "proposes reassignments or escalates",
    metric: "loads covered per driver-day",
  },
];

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="bg-offwhite">
        {/* Hero */}
        <section className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 pb-16 pt-20 md:pt-28">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Proof of concept</div>
            <h1 className="mt-3 text-5xl font-bold tracking-tight text-ink-900 md:text-6xl">Haulio</h1>
            <p className="mt-3 max-w-2xl text-xl text-ink-600">
              An AI dispatcher copilot for Australian road freight operators
            </p>
            <p className="mt-8 max-w-3xl text-[15px] leading-7 text-ink-700">
              Diesel in Queensland has sat around 100 c/L above its February 2026 level since the Strait of Hormuz
              closed, and every contract with a fuel levy is either under-recovering or being re-priced by hand.
              Floods cut the Bruce and Stuart highways this year, and each closure means a dispatcher re-planning
              loads one phone call at a time. Australia is roughly 28,000 truck drivers short, so the people doing
              that re-planning are the same people covering the gaps on the road.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <DemoButton />
              <Link href="/about" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:text-ink-900">
                How it works <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Agents */}
        <section id="agents" className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-ink-900">Three agents, one approval queue</h2>
              <p className="mt-1 text-sm text-ink-500">Each agent watches one signal, decides with deterministic tools, and proposes. A dispatcher approves.</p>
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {AGENTS.map((a) => (
              <div key={a.name} className="flex flex-col rounded-xl border border-ink-200 bg-white p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-white [&>svg]:h-4 [&>svg]:w-4">{a.icon}</span>
                  <Pill tone={a.status === "Live model" ? "success" : "neutral"}>{a.status}</Pill>
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{a.name}</h3>
                <dl className="mt-4 space-y-3 text-[13px]">
                  <Row k="Trigger" v={a.trigger} />
                  <Row k="Decision" v={a.decision} />
                  <Row k="Action" v={a.action} />
                  <Row k="Metric" v={a.metric} />
                </dl>
              </div>
            ))}
          </div>
        </section>

        {/* What this is */}
        <section className="border-t border-ink-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">What this is</div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-ink-700">
              A proof of concept. Real HERE truck routing, a real OpenAI agent loop with a pinned model, a human
              approval queue, evals, and a cost meter. Seeded Brisbane fleet; prices and closures from 2026 public
              sources, scenarios simulated.
            </p>
            <div className="mt-6"><DemoButton size="md" /></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400 pt-0.5">{k}</dt>
      <dd className="text-ink-700">{v}</dd>
    </div>
  );
}
