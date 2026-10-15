import Link from "next/link";
import { ArrowRight, Fuel, TriangleAlert, Users, Check } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DemoButton } from "@/components/DemoButton";
import { Mark, BRAND_TAGLINE } from "@/components/Logo";
import { Eyebrow, Pill } from "@/components/ui/primitives";
import { Term } from "@/components/Term";

const STATS = [
  { value: "+104c", label: "a litre more for diesel than in February", source: "ACCC, 7 Oct 2026" },
  { value: "+15.5%", label: "road freight prices in a quarter", source: "ABS, June 2026" },
  { value: "28,000", label: "truck drivers short", source: "NatRoad" },
];

/** The three AI helpers, each phrased as the question it answers. Shared with /agents via lib/ui/plain. */
const AGENTS = [
  {
    icon: <Fuel />, name: "Fuel AI helper", status: "Working now", tone: "success" as const,
    question: "When diesel goes up, which customers should pay more, and how much?",
    does: "Checks today's diesel price against every customer's contract and works out what their fuel surcharge should be.",
    never: "Changes a customer's prices without you. It writes the suggestion and the note to the customer; you accept or decline.",
    worth: "The dollars a week you are not charging, shown per customer.",
  },
  {
    icon: <TriangleAlert />, name: "Road AI helper", status: "Working now", tone: "success" as const,
    question: "When a road closes, what should each truck do?",
    does: "Finds which delivery jobs go through the closure, looks for a truck-legal route around it, and suggests a new route, a wait at the depot, or a call to you for each one.",
    never: "Moves a truck or tells a customer without you. Urgent goods and goods that spoil are never quietly parked.",
    worth: "The value of the goods kept moving, and the hours saved.",
  },
  {
    icon: <Users />, name: "Driver-cover AI helper", status: "Coming next, rules only", tone: "neutral" as const,
    question: "When a driver is off, who can legally take the job?",
    does: "Lists the jobs with no driver, checks which trucks are free and within the driving-hours rules, and suggests the nearest one that can legally do it.",
    never: "Swaps a job to another truck without you. If nobody can legally take it, it says so and asks you.",
    worth: "Jobs covered without a subcontractor, per driver-day.",
  },
];

const REAL = [
  { k: "Truck routing (the routing service)", v: "Real", tone: "success" as const },
  { k: "Weather along the route", v: "Real", tone: "success" as const },
  { k: "The AI", v: "Real, one fixed version", tone: "success" as const },
  { k: "Brisbane fleet", v: "Made up for the demo", tone: "neutral" as const },
  { k: "Diesel prices", v: "Based on real ACCC prices", tone: "warning" as const },
  { k: "Road closures", v: "Made up, or from a demo button", tone: "warning" as const },
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
                <div className="text-4xl font-extrabold tracking-tight md:text-5xl">Haulora</div>
                <div className="text-sm font-medium text-rust-300">{BRAND_TAGLINE}</div>
              </div>
            </div>
            <h1 className="mt-8 max-w-3xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              AI helpers that watch fuel, roads and drivers, and suggest the next move. You say yes or no.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/70 md:text-lg">
              Built for Australian trucking operators. One helper watches diesel prices, one watches the roads, one watches who is free to drive.
              Every suggestion lands in one place with the numbers and the note to the customer already written.
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
          <Eyebrow>Three AI helpers, one place to decide</Eyebrow>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-bitumen-900">The questions you ask every week, answered with a <Term t="proposal" />.</h2>
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
                  <Row k="What it does" v={a.does} />
                  <Row k="What it never does" v={a.never} />
                  <Row k="What it is worth" v={a.worth} />
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
                <Eyebrow>What is real in this demo</Eyebrow>
                <p className="mt-2 text-sm leading-6 text-bitumen-600">
                  Real truck routing, real weather, and a real AI doing the thinking.
                  The fleet and the things that go wrong are made up so you can try the demo as many times as you like.
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
    <div className="grid grid-cols-[92px_1fr] gap-2">
      <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-bitumen-400">{k}</dt>
      <dd className="text-bitumen-700">{v}</dd>
    </div>
  );
}
