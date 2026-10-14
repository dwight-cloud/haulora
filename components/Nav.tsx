import Link from "next/link";
import {
  BarChart3, Briefcase, ClipboardCheck, FileText, FileCheck2,
  Gauge, LayoutGrid, LifeBuoy, MapPinned, MessageSquare, Network,
  Route, Settings2, Shield, ShieldAlert, Truck, Users, Wrench,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { Wordmark } from "./Logo";
import { LogoutButton } from "./LogoutButton";

/**
 * App shell navigation.
 *   - Logged-in dispatcher / driver: fixed left sidebar (240px), content
 *     below pads `main` via a scoped <style> so existing pages don't need
 *     layout changes.
 *   - Everyone else (landing, login): minimal sticky top bar.
 */
export async function Nav() {
  const session = await getSession();

  if (!session) {
    return (
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-ink-900"><Wordmark /></Link>
          <nav className="flex items-center gap-1 text-sm">
            <TopLink href="/#features">Features</TopLink>
            <TopLink href="/#pricing">Pricing</TopLink>
            <Link
              href="/login"
              className="ml-3 rounded-lg bg-ink-900 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-ink-800"
            >Sign in</Link>
          </nav>
        </div>
      </header>
    );
  }

  const dispatcher = session.role === "dispatcher";

  return (
    <>
      {/* When the sidebar is present, every page's <main> should flow next to
          it and use the available width — kill the global mx-auto / max-w-7xl
          so content doesn't get stranded in a 1280px column with huge gutters. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (min-width: 768px) {
          body > main, main:not([data-no-shell]) {
            padding-left: calc(240px + 2rem) !important;
            padding-right: 2rem !important;
            max-width: none !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
        }
      `}} />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-ink-200 bg-white md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-ink-100 px-5">
          <Link href={dispatcher ? "/dashboard" : "/driver"} className="text-ink-900">
            <Wordmark />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
          {dispatcher ? (
            <>
              <SectionLabel>Fleet</SectionLabel>
              <SideLink href="/dashboard" icon={<LayoutGrid />}>Dashboard</SideLink>
              <SideLink href="/team"      icon={<Users />}>Team</SideLink>
              <SideLink href="/carriers"  icon={<Briefcase />}>Carriers</SideLink>
              <SideLink href="/messages"  icon={<MessageSquare />}>Messages</SideLink>

              <SectionLabel className="mt-5">Planning</SectionLabel>
              <SideLink href="/plan"     icon={<Route />}>Plan route</SideLink>
              <SideLink href="/sequence" icon={<MapPinned />}>Multi-stop</SideLink>
              <SideLink href="/tours"    icon={<Network />}>Tour planner</SideLink>

              <SectionLabel className="mt-5">Admin</SectionLabel>
              <SideLink href="/permits"      icon={<Shield />}>Permits</SideLink>
              <SideLink href="/integrations" icon={<Settings2 />}>Integrations</SideLink>
            </>
          ) : (
            <>
              <SectionLabel>Driving</SectionLabel>
              <SideLink href="/driver"    icon={<Truck />}>Today</SideLink>
              <SideLink href="/hos"       icon={<Gauge />}>HOS</SideLink>
              <SideLink href="/dvir"      icon={<Wrench />}>DVIR</SideLink>
              <SideLink href="/pod"       icon={<ClipboardCheck />}>POD</SideLink>

              <SectionLabel className="mt-5">Records</SectionLabel>
              <SideLink href="/documents" icon={<FileText />}>Documents</SideLink>
              <SideLink href="/ifta"      icon={<FileCheck2 />}>IFTA</SideLink>
              <SideLink href="/reports"   icon={<BarChart3 />}>Reports</SideLink>
              <SideLink href="/scorecard" icon={<ShieldAlert />}>Scorecard</SideLink>
            </>
          )}

          <div className="mt-auto pt-4">
            <a
              href="https://developer.here.com/"
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-700"
            >
              <LifeBuoy className="h-3.5 w-3.5" /> Help &amp; docs
            </a>
          </div>
        </nav>

        <div className="flex items-center gap-2.5 border-t border-ink-100 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-bold text-white">
            {initials(session.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink-900">{session.name}</div>
            <div className="truncate text-[11px] text-ink-500">{session.accountName}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile-only top bar (sidebar hidden below md). Keeps the sign-in brand visible. */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-ink-200 bg-white/90 px-4 backdrop-blur md:hidden">
        <Link href={dispatcher ? "/dashboard" : "/driver"} className="text-ink-900"><Wordmark /></Link>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white">
          {initials(session.name)}
        </div>
      </header>
    </>
  );
}

// -------- sub-components --------

function TopLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400 ${className}`}>
      {children}
    </div>
  );
}

function SideLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
    >
      <span className="shrink-0 text-ink-500 transition group-hover:text-ink-800 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
}
