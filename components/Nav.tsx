import Link from "next/link";
import {
  Bot, CheckSquare, FlaskConical, LayoutGrid, LifeBuoy, MapPinned,
  Network, Route, Users,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { Wordmark } from "./Logo";
import { LogoutButton } from "./LogoutButton";

/**
 * App shell navigation.
 *   - Logged-in dispatcher / driver: fixed left sidebar (240px); content
 *     below pads `main` via a scoped <style> so existing pages don't need
 *     layout changes.
 *   - Everyone else (landing, login): minimal sticky top bar.
 */
export async function Nav() {
  const session = await getSession();

  if (!session) {
    return (
      <header className="sticky top-0 z-40 border-b border-bitumen-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 md:px-6">
          <Link href="/" className="rounded-md" aria-label="Haulio home"><Wordmark /></Link>
          <nav className="flex items-center gap-1 text-sm">
            <TopLink href="/#agents" className="hidden sm:inline-flex">Agents</TopLink>
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

  void session.role;

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
          <Link href="/dashboard" className="rounded-md" aria-label="Haulio dashboard"><Wordmark /></Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
          <SectionLabel>Dispatcher</SectionLabel>
          <SideLink href="/dashboard" icon={<LayoutGrid />}>Dashboard</SideLink>
          <SideLink href="/approvals" icon={<CheckSquare />}>Approvals</SideLink>

          <SectionLabel className="mt-5">For engineers</SectionLabel>
          <SideLink href="/agents"    icon={<Bot />}>Agents &amp; runs</SideLink>
          <SideLink href="/evals"     icon={<FlaskConical />}>Evals &amp; cost</SideLink>

          <SectionLabel className="mt-5">Planning</SectionLabel>
          <SideLink href="/plan"     icon={<Route />}>Plan route</SideLink>
          <SideLink href="/sequence" icon={<MapPinned />}>Multi-stop</SideLink>
          <SideLink href="/tours"    icon={<Network />}>Tour planner</SideLink>

          <SectionLabel className="mt-5">Admin</SectionLabel>
          <SideLink href="/team"     icon={<Users />}>Team</SideLink>

          <div className="mt-auto pt-4">
            <Link
              href="/about"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-bitumen-500 hover:bg-bitumen-50 hover:text-bitumen-700"
            >
              <LifeBuoy className="h-3.5 w-3.5" /> How this works
            </Link>
          </div>
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

      {/* Mobile shell: top bar with brand, bottom tab bar with the four copilot pages. */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-bitumen-200 bg-white/90 px-4 backdrop-blur md:hidden">
        <Link href="/dashboard" className="rounded-md" aria-label="Haulio dashboard"><Wordmark size="sm" /></Link>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rust-500 text-[10px] font-bold text-white">
            {initials(session.name)}
          </div>
          <LogoutButton />
        </div>
      </header>
      <nav aria-label="Main pages" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-bitumen-200 bg-white/95 backdrop-blur md:hidden">
        <TabLink href="/dashboard" icon={<LayoutGrid />}>Dashboard</TabLink>
        <TabLink href="/agents" icon={<Bot />}>Agents</TabLink>
        <TabLink href="/approvals" icon={<CheckSquare />}>Approvals</TabLink>
        <TabLink href="/evals" icon={<FlaskConical />}>Evals</TabLink>
      </nav>
      {/* Reserve room for the mobile tab bar */}
      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 767px) { main { padding-bottom: 5rem !important; } }` }} />
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

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-bitumen-400 ${className}`}>
      {children}
    </div>
  );
}

function SideLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-bitumen-600 transition hover:bg-bitumen-50 hover:text-bitumen-900"
    >
      <span className="shrink-0 text-bitumen-500 transition group-hover:text-rust-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

function TabLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-bitumen-600 hover:text-rust-600">
      <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {children}
    </Link>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
}
