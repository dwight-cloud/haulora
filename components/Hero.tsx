import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-ink-900 text-offwhite">
      {/* layered backgrounds for depth */}
      <div className="absolute inset-0 bg-hero-glow" aria-hidden />
      <div
        className="absolute inset-0 bg-grid-navy [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-ink-100 blur-3xl" aria-hidden />

      <div className="relative mx-auto grid max-w-7xl gap-16 px-6 py-24 md:grid-cols-[1.1fr_1fr] md:py-32 md:pr-0">
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-offwhite/80 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-900" />
            Built for commercial fleets
          </div>
          <h1 className="mt-6 text-5xl font-black leading-[1.05] tracking-tight md:text-[64px]">
            Truck-smart routes.<br />
            <span className="bg-gradient-to-r from-signal-200 via-signal to-signal-500 bg-clip-text text-transparent">
              Fleet-wide control.
            </span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-offwhite/75">
            Clear Path Overdrive Nav plans commercial-legal routes around heights, weights,
            hazmat zones, and driver hours — then hands each run off to your
            driver&rsquo;s phone with the last-mile details you define.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3.5 font-bold text-white shadow-glow transition hover:brightness-110"
            >
              Start a fleet account
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="transition group-hover:translate-x-0.5">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href="/plan"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 font-semibold text-offwhite backdrop-blur transition hover:bg-white/10"
            >
              See the planner
            </Link>
          </div>

          <div className="mt-12 flex items-center gap-8 text-xs text-offwhite/50">
            <Metric n="DOT-legal" l="routing" />
            <div className="h-8 w-px bg-white/10" />
            <Metric n="30+" l="ELD vendors" />
            <div className="h-8 w-px bg-white/10" />
            <Metric n="iOS" l="driver app" />
          </div>
        </div>

        {/* Right-side dashboard preview */}
        <div className="relative hidden md:block">
          <div className="absolute -inset-4 rounded-3xl bg-ink-100 blur-2xl" aria-hidden />
          <div className="relative ml-auto w-full max-w-[520px] rounded-2xl border border-white/10 bg-navy-900/80 p-4 shadow-card-lg backdrop-blur animate-fade-up [animation-delay:120ms]">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
              </div>
              <div className="ml-3 text-xs text-offwhite/40">dashboard · live</div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Tile label="Active" value="42" trend="+6" />
              <Tile label="On-time" value="96%" trend="+2.1" />
              <Tile label="Risk avg" value="18" trend="-3" good />
            </div>
            <div className="mt-4 rounded-xl border border-white/5 bg-ink-900 p-3">
              <div className="flex items-center justify-between text-xs text-offwhite/60">
                <span>DAL → HOU · Unit 1042</span>
                <span className="rounded bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-300">ON ROUTE</span>
              </div>
              <svg viewBox="0 0 300 80" className="mt-3 h-20 w-full">
                <defs>
                  <linearGradient id="route" x1="0" x2="1">
                    <stop offset="0%"   stopColor="#FF8233" />
                    <stop offset="100%" stopColor="#E55400" />
                  </linearGradient>
                </defs>
                <path
                  d="M10 60 C 60 20, 110 80, 160 40 S 260 20, 290 50"
                  stroke="url(#route)"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
                <circle cx="10"  cy="60" r="4" fill="#FF8233" />
                <circle cx="290" cy="50" r="4" fill="#FF8233" />
                <circle cx="160" cy="40" r="3" fill="#FFF" />
              </svg>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] text-offwhite/60">
                <span>239 mi</span><span>3.6 h</span><span>risk 18</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Logos strip */}
      <div className="relative border-t border-white/5 bg-navy-900/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-6 py-6 text-xs font-semibold uppercase tracking-widest text-offwhite/40">
          <span>Works with the tools you already pay for</span>
          <span>Samsara</span>
          <span>Motive</span>
          <span>Geotab</span>
          <span>Verizon Connect</span>
          <span>Fleetio</span>
        </div>
      </div>
    </section>
  );
}

function Metric({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="text-sm font-bold text-offwhite">{n}</div>
      <div className="text-[10px] uppercase tracking-widest">{l}</div>
    </div>
  );
}

function Tile({ label, value, trend, good }: { label: string; value: string; trend: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-widest text-offwhite/50">{label}</div>
      <div className="mt-1 flex items-baseline justify-between">
        <div className="text-lg font-black">{value}</div>
        <div className={`text-[10px] font-bold ${good ? "text-green-300" : "text-ink-900-200"}`}>{trend}</div>
      </div>
    </div>
  );
}
