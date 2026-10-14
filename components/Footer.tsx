import { Wordmark } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-ink-900 text-offwhite">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <div className="text-offwhite"><Wordmark onDark /></div>
          <p className="mt-4 max-w-sm text-sm text-offwhite/60">
            Commercial-legal navigation and fleet-wide dispatch for trucking
            companies that want their tools to keep up with the road.
          </p>
        </div>
        <FooterCol title="Product" links={[["Features","/#features"],["Planner","/plan"],["Dashboard","/dashboard"]]} />
        <FooterCol title="Company" links={[["About","/about"],["Careers","/careers"],["Contact","/contact"]]} />
        <FooterCol title="Legal" links={[["Privacy","/privacy"],["Terms","/terms"],["Security","/security"]]} />
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 text-xs text-offwhite/50">
          <div>© {new Date().getFullYear()} Overdrive Nav. All rights reserved.</div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-offwhite/40">{title}</div>
      <ul className="mt-4 space-y-2 text-sm text-offwhite/80">
        {links.map(([label, href]) => (
          <li key={href}><a href={href} className="hover:text-ink-900">{label}</a></li>
        ))}
      </ul>
    </div>
  );
}
