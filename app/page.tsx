import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { FeatureGrid } from "@/components/FeatureGrid";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <FeatureGrid />

        {/* Split: dispatcher vs driver */}
        <section className="border-y border-ink-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 py-24 md:grid-cols-2">
            <Panel
              eyebrow="For dispatchers"
              title="A command deck that actually helps you dispatch."
              body="See every truck, their HOS, their route risk, and their fuel in one glance. Assign loads, push route updates, and handle the ten things that happen between 6 and 7am."
              cta={{ label: "Open the dashboard", href: "/dashboard" }}
              accent="navy"
            />
            <Panel
              eyebrow="For drivers"
              title="One tap. Your route, your drop-off, your hours."
              body="No toggling between five apps. Your assigned run, commercial-legal turn-by-turn, and the last-mile details dispatch baked in — all on your phone."
              cta={{ label: "See the driver view", href: "/driver" }}
              accent="signal"
            />
          </div>
        </section>

        {/* Pricing / CTA */}
        <section id="pricing" className="relative overflow-hidden bg-ink-900 text-offwhite">
          <div className="absolute inset-0 bg-hero-glow opacity-70" aria-hidden />
          <div className="relative mx-auto max-w-5xl px-6 py-24 text-center">
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">
              Ready to see it on your lanes?
            </h2>
            <p className="mt-4 text-lg text-offwhite/70">
              Start a fleet account in 60 seconds — no credit card until you invite a second dispatcher.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/login"
                className="rounded-xl bg-ink-900 px-7 py-3.5 font-bold text-white shadow-glow transition hover:brightness-110"
              >
                Start a fleet account
              </Link>
              <Link
                href="/plan"
                className="rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold backdrop-blur transition hover:bg-white/10"
              >
                Try the planner first
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Panel({
  eyebrow, title, body, cta, accent,
}: { eyebrow: string; title: string; body: string; cta: { label: string; href: string }; accent: "navy" | "signal" }) {
  return (
    <div className="relative rounded-2xl border border-ink-200 bg-offwhite p-8 shadow-card">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${
        accent === "signal" ? "bg-ink-100 text-ink-900-700" : "bg-ink-50 text-ink-600"
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${accent === "signal" ? "bg-ink-900" : "bg-ink-900"}`} />
        {eyebrow}
      </div>
      <h3 className="mt-4 text-2xl font-black tracking-tight md:text-3xl">{title}</h3>
      <p className="mt-3 text-ink-500">{body}</p>
      <Link
        href={cta.href}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-ink-900 hover:text-ink-900"
      >
        {cta.label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </Link>
    </div>
  );
}
