interface Feature {
  title: string;
  body: string;
  icon: React.ReactNode;
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const features: Feature[] = [
  {
    title: "Commercial-legal routing",
    body: "Route around low bridges, weight limits, and hazmat restrictions with truck-aware turn-by-turn that adapts as your fleet grows.",
    icon: <Icon d="M3 12h3l2-7 4 14 3-9 2 4h4" />,
  },
  {
    title: "Last-mile you control",
    body: "Define gate codes, yard layouts, and drop-off bays once; every driver gets the same clean handoff on their phone.",
    icon: <Icon d="M12 2v6m0 0l-3-3m3 3l3-3M4 14h16M6 14v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6" />,
  },
  {
    title: "Private fuel network",
    body: "Plug in your negotiated fuel program and watch stops slot into routes automatically — no detours drivers didn't ask for.",
    icon: <Icon d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16m-11 0h11m-11 0H3m11 0h4a2 2 0 0 0 2-2v-6l-2-2m0 0V6" />,
  },
  {
    title: "Live traffic & 511 cameras",
    body: "Department-of-transport cameras and incident feeds overlay on the dispatcher map so you see problems before dispatch does.",
    icon: <Icon d="M2 12h3m14 0h3M12 2v3m0 14v3M4.5 4.5l2 2m11 11l2 2m0-15l-2 2m-11 11l-2 2M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />,
  },
  {
    title: "Works with your ELD",
    body: "Pulls hours-of-service from Samsara and the other ELDs you already pay for. No rip-and-replace.",
    icon: <Icon d="M4 7h16M4 12h16M4 17h10M17 17l2 2 3-3" />,
  },
  {
    title: "Risk score on every run",
    body: "A single 0–100 number per route surfaces grade, weather, and bridge risk so dispatch can rebalance before wheels roll.",
    icon: <Icon d="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />,
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative bg-offwhite">
      <div className="mx-auto max-w-7xl px-6 py-28">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ink-900 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-900" />
            Features
          </div>
          <h2 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">
            Everything dispatch actually uses.
          </h2>
          <p className="mt-4 text-lg text-ink-500">
            A tight feature set built for the way real trucking companies run today — no filler, no seat-based games.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl border border-ink-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-lg"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-signal-100 to-signal-200 text-ink-900-700 transition group-hover:from-signal-200 group-hover:to-signal-300">
                {f.icon}
              </div>
              <h3 className="mt-5 text-lg font-bold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-500">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
