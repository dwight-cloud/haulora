import Link from "next/link";
import {
  Bot, BookOpen, CheckSquare, ClipboardList, FileBarChart, LayoutGrid, MapPinned,
  Network, Package, Route, Smartphone, TriangleAlert, Truck, Users, Building2,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { listActions } from "@/lib/domain/repo";
import { Wordmark } from "./Logo";
import { LogoutButton } from "./LogoutButton";
import { HelperPanel } from "./HelperPanel";
import { Tour } from "./Tour";

/**
 * App shell navigation.
 *   - Logged-in dispatcher: fixed left sidebar (240px) laid out as a fleet
 *     management system; the AI helper and guided tour are mounted here so
 *     they appear on every signed-in page.
 *   - Everyone else (landing, login): minimal sticky top bar.
 */
export async function Nav() {
  const session = await getSession();

  if (!session) {
    return (
      <header className="sticky top-0 z-40 border-b border-bitumen-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 md:px-6">
          <Link href="/" className="rounded-md" aria-label="Haulora home"><Wordmark /></Link>
          <nav className="flex items-center gap-1 text-sm">
            <TopLink href="/#agents" className="hidden sm:inline-flex">AI helpers</TopLink>
            <TopLink href="/about">How it works</TopLink>
            <Link
              href="/login"
              className="ml-2 inline-flex min-h-[44px] items-center rounded-lg bg-bitumen-900 px-4 text-sm font-semibold text-white transition hover:bg-bitumen-800 md:min-h-0 md:py-1.5"
            >Sign in</Link>
          </nav>
        </div>
      </header>
    );
  }

  let pending = 0;
  try { pending = listActions(session.accountId, "proposed").length; } catch { /* db unavailable */ }

  return (
    <>
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

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-bitumen-200 bg-white md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-bitumen-100 px-5">
          <Link href="/dashboard" className="rounded-md" aria-label="Haulora overview"><Wordmark /></Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
          <SectionLabel>Your fleet</SectionLabel>
          <SideLink href="/dashboard"   icon={<LayoutGrid />}>Overview</SideLink>
          <SideLink href="/fleet"       icon={<Truck />}>Trucks</SideLink>
          <SideLink href="/loads"       icon={<Package />}>Delivery jobs</SideLink>
          <SideLink href="/customers"   icon={<Building2 />}>Customers</SideLink>
          <SideLink href="/disruptions" icon={<TriangleAlert />}>Road problems</SideLink>
          <SideLink href="/decisions"   icon={<CheckSquare />} badge={pending}>Your decisions</SideLink>
          <SideLink href="/agents"      icon={<Bot />}>AI helpers</SideLink>
          <SideLink href="/driver-preview" icon={<Smartphone />} small>Driver app</SideLink>

          <SectionLabel className="mt-5" small>For engineers</SectionLabel>
          <SideLink href="/evals" icon={<FileBarChart />} small>Accuracy tests</SideLink>
          <SideLink href="/about" icon={<BookOpen />} small>How it works</SideLink>

          <SectionLabel className="mt-5" small>Planning tools</SectionLabel>
          <SideLink href="/plan"     icon={<Route />} small>Plan a route</SideLink>
          <SideLink href="/sequence" icon={<MapPinned />} small>Multi-stop</SideLink>
          <SideLink href="/tours"    icon={<Network />} small>Tour planner</SideLink>

          <SectionLabel className="mt-5" small>Admin</SectionLabel>
          <SideLink href="/team" icon={<Users />} small>Team</SideLink>
        </nav>

        <div className="flex items-center gap-2.5 border-t border-bitumen-100 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rust-500 text-[11px] font-bold text-white">
            {initials(session.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-bitumen-900">{session.name}</div>
            <div className="truncate text-[11px] text-bitumen-500">{session.accountName}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile shell: top bar with brand, bottom tab bar with the main fleet pages. */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-bitumen-200 bg-white/90 px-4 backdrop-blur md:hidden">
        <Link href="/dashboard" className="rounded-md" aria-label="Haulora overview"><Wordmark size="sm" /></Link>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rust-500 text-[10px] font-bold text-white">
            {initials(session.name)}
          </div>
          <LogoutButton />
        </div>
      </header>
      <nav aria-label="Main pages" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-bitumen-200 bg-white/95 backdrop-blur md:hidden">
        <TabLink href="/dashboard" icon={<LayoutGrid />}>Overview</TabLink>
        <TabLink href="/fleet" icon={<Truck />}>Trucks</TabLink>
        <TabLink href="/loads" icon={<Package />}>Jobs</TabLink>
        <TabLink href="/disruptions" icon={<TriangleAlert />}>Roads</TabLink>
        <TabLink href="/decisions" icon={<ClipboardList />} badge={pending}>Decisions</TabLink>
      </nav>
      {/* Reserve room for the mobile tab bar */}
      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 767px) { main { padding-bottom: 5rem !important; } }` }} />

      <HelperPanel />
      <Tour />
    </>
  );
}

// -------- sub-components --------

function TopLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center rounded-md px-2.5 text-sm font-medium text-bitumen-600 transition hover:bg-bitumen-100 hover:text-bitumen-900 md:min-h-0 md:py-1.5 ${className}`}
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children, className = "", small = false }: { children: React.ReactNode; className?: string; small?: boolean }) {
  return (
    <div className={`px-2.5 pb-1.5 pt-2 font-semibold uppercase tracking-[0.14em] ${small ? "text-[9px] text-bitumen-300" : "text-[10px] text-bitumen-400"} ${className}`}>
      {children}
    </div>
  );
}

function SideLink({ href, icon, children, badge, small = false }: { href: string; icon: React.ReactNode; children: React.ReactNode; badge?: number; small?: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 rounded-md px-2.5 font-medium text-bitumen-600 transition hover:bg-bitumen-50 hover:text-bitumen-900 ${small ? "py-1 text-[12px]" : "py-1.5 text-[13px]"}`}
    >
      <span className={`shrink-0 text-bitumen-500 transition group-hover:text-rust-600 ${small ? "[&>svg]:h-3.5 [&>svg]:w-3.5" : "[&>svg]:h-4 [&>svg]:w-4"}`}>{icon}</span>
      <span className="truncate">{children}</span>
      {badge ? (
        <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-rust-500 px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums" aria-label={`${badge} waiting`}>{badge}</span>
      ) : null}
    </Link>
  );
}

function TabLink({ href, icon, children, badge }: { href: string; icon: React.ReactNode; children: React.ReactNode; badge?: number }) {
  return (
    <Link href={href} className="relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-bitumen-600 hover:text-rust-600">
      <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {children}
      {badge ? <span className="absolute right-3 top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rust-500 px-1 text-[10px] font-bold leading-[18px] text-white">{badge}</span> : null}
    </Link>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
}
