import Link from "next/link";
import { ArrowRight, Fuel, TriangleAlert, Users, Check } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DemoButton } from "@/components/DemoButton";
import { Mark, BRAND_TAGLINE } from "@/components/Logo";
import { Eyebrow, Pill } from "@/components/ui/primitives";

const STATS = [
  { value: "+104 c/L", label: "diesel above February", source: "ACCC, 7 Oct 2026" },
  { value: "+15.5%", label: "road freight prices in a quarter", source: "ABS, June 2026" },
  { value: "28,000", label: "truck drivers short", source: "NatRoad" },
];

const AGENTS = [
  {
    icon: <Fuel />, name: "Fuel agent", status: "Live", tone: "success" as const,
    question: "When diesel moves, who should pay more and how much?",
    trigger: "Diesel price moves",
    decision: "What each customer's levy should be",
    proposal: "Rate-card updates with the notice drafted",
    metric: "A$ recovered per week",
  },
  {
    icon: <TriangleAlert />, name: "Disruption agent", status: "Live", tone: "success" as const,
    question: "The highway is cut. Which trucks turn around, which wait, and who do I call?",
    trigger: "Road or weather event",
    decision: "Reroute, hold, proceed or escalate per load",
    proposal: "Truck-legal detours and holds",
    metric: "Cargo value protected, hours saved",
  },
  {
    icon: <Users />, name: "Capacity agent", status: "Phase 2, rules-only", tone: "neutral" as const,
    question: "Two drivers are out. Who can legally cover their loads today?",
    trigger: "Driver or truck unavailable",
    decision: "Which idle truck can legally cover",
    proposal: "Reassignments, or an escalation",
    metric: "Loads covered per driver-day",
  },
];

const REAL = [
  { k: "HERE truck routing", v: "Live", tone: "success" as const },
  { k: "Open-Meteo weather", v: "Live", tone: "success" as const },
  { k: "Model", v: "Live, pinned id", tone: "success" as const },
  { k: "Brisbane fleet", v: "Seeded", tone: "neutral" as const },
  { k: "Diesel prices", v: "ACCC reference points", tone: "warning" as const },
  { k: "Road closures", v: "Seeded or scenario", tone: "warning" as const },
];

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="bg-canvas">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-bitumen-200 bg-bitumen-900 text-white">
          <div className="absolute inset-0 bg-hero-glow" aria-hidden />
          <div
            className="absolute inset-0 bg-grid-dark [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_top_left,black_20%,transparent_75%)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-14 md:px-6 md:pb-20 md:pt-24">
            <div className="flex items-center gap-3">
              <Mark size={56} onDark />
              <div>
                <div className="text-4xl font-extrabold tracking-tight md:text-5xl">Haulio</div>
                <div className="text-sm font-medium text-rust-300">{BRAND_TAGLINE}</div>
              </div>
            </div>
            <h1 className="mt-8 max-w-3xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              Agents that watch fuel, roads and drivers, and propose the next move. You approve.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/70 md:text-lg">
              A fuel agent, a disruption agent and a capacity agent for Australian road freight operators.
              Every proposal lands in one approval queue with the numbers and the customer notice already drafted.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <DemoButton />
              <Link
                href="/about"
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-lg border border-white/20 px-5 text-[15px] font-semibold text-white transition hover:bg-white/10"
              >
                How it works <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
          <div className="grid gap-3 sm:grid-cols-3">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-bitumen-200 bg-white p-5 shadow-card">
                <div className="text-3xl font-extrabold tracking-tight text-rust-600 tabular-nums md:text-4xl">{s.value}</div>
                <div className="mt-1 text-sm font-medium text-bitumen-900">{s.label}</div>
                <div className="mt-1 text-xs text-bitumen-500">{s.source}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Agents */}
        <section id="agents" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-12 md:px-6 md:pb-16">
          <Eyebrow>Three agents, one approval queue</Eyebrow>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-bitumen-900">The questions a dispatcher asks every week, answered with a proposal.</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {AGENTS.map((a) => (
              <article key={a.name} className="flex flex-col rounded-xl border border-bitumen-200 bg-white p-5 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-rust-50 text-rust-600 [&>svg]:h-5 [&>svg]:w-5">{a.icon}</span>
                  <Pill tone={a.tone} filled>{a.status}</Pill>
                </div>
                <h3 className="mt-4 text-[17px] font-semibold leading-6 text-bitumen-900">{a.question}</h3>
                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-bitumen-400">{a.name}</div>
                <dl className="mt-3 space-y-2.5 text-[13px]">
                  <Row k="Trigger" v={a.trigger} />
                  <Row k="Decision" v={a.decision} />
                  <Row k="Proposal" v={a.proposal} />
                  <Row k="Metric" v={a.metric} />
                </dl>
              </article>
            ))}
          </div>
        </section>

        {/* What is real */}
        <section className="border-t border-bitumen-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-md">
                <Eyebrow>What is real in this proof of concept</Eyebrow>
                <p className="mt-2 text-sm leading-6 text-bitumen-600">
                  Real truck routing, real weather, a real model loop with a pinned id and a measured cost meter.
                  The fleet and the shocks are seeded so the demo is repeatable.
                </p>
                <div className="mt-5"><DemoButton size="md" /></div>
              </div>
              <ul className="grid flex-1 gap-2 sm:grid-cols-2">
                {REAL.map((r) => (
                  <li key={r.k} className="flex items-center justify-between gap-3 rounded-lg border border-bitumen-200 bg-canvas px-3 py-2.5 text-[13px]">
                    <span className="flex items-center gap-2 font-medium text-bitumen-800">
                      <Check className="h-3.5 w-3.5 text-gum-600" /> {r.k}
                    </span>
                    <Pill tone={r.tone} filled>{r.v}</Pill>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[76px_1fr] gap-2">
      <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-bitumen-400">{k}</dt>
      <dd className="text-bitumen-700">{v}</dd>
    </div>
  );
}
