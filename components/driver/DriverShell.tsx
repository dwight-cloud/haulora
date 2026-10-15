"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CalendarCheck, MessageCircle, TriangleAlert, Truck, UserRound } from "lucide-react";
import { Mark } from "@/components/Logo";
import { cx } from "@/components/ui/primitives";
import { api } from "@/lib/ui/format";
import type { Truck as TruckT } from "@/lib/domain/types";
import type { DriverJob } from "@/lib/domain/driver";

export interface Me {
  user: { id: string; name: string; role: "dispatcher" | "driver"; accountName: string };
  truck: TruckT;
  trucks: TruckT[];
  jobs: DriverJob[];
}

interface Ctx { me: Me | null; error: string | null; refresh: () => Promise<void> }
const DriverCtx = createContext<Ctx>({ me: null, error: null, refresh: async () => {} });
export const useDriver = () => useContext(DriverCtx);

const TRUCK_KEY = "haulora.driver.truckPicked";
export function markTruckPicked() { try { localStorage.setItem(TRUCK_KEY, "1"); } catch { /* ignore */ } }

export function DriverShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPick, setNeedsPick] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const d = await api<Me>("/api/driver/me");
      setMe(d); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your day");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // One-time "Which truck are you in today?" on the first visit in this browser.
  useEffect(() => {
    try { setNeedsPick(localStorage.getItem(TRUCK_KEY) !== "1"); } catch { setNeedsPick(false); }
  }, []);

  const tab = (href: string) => pathname === href || (href !== "/driver" && pathname.startsWith(href));
  const showPicker = needsPick && pathname !== "/driver/truck";

  return (
    <DriverCtx.Provider value={{ me, error, refresh }}>
      <header className="sticky top-0 z-30 border-b border-bitumen-200 bg-bitumen-900 text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-14 max-w-[560px] items-center justify-between gap-3 px-4">
          <Link href="/driver" className="flex items-center gap-2 rounded-md" aria-label="Haulora driver home">
            <Mark size={28} onDark />
            <span className="text-[15px] font-bold tracking-tight">Haulora</span>
            <span className="hidden text-[11px] font-medium text-white/50 sm:inline">Driver</span>
          </Link>
          <div className="flex items-center gap-1">
            {me?.truck && (
              <Link href="/driver/truck" className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold hover:bg-white/10" title="Switch truck">
                <Truck className="h-4 w-4 text-rust-300" aria-hidden />
                <span className="tabular-nums">{me.truck.code}</span>
                <span className="text-[11px] font-medium text-white/50">Switch</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("haulora:helper:open"))}
              aria-label="Ask Haulora"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[560px] px-4 pb-28 pt-4" data-no-shell>
        {error && !me ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-800">
            {error}. <Link href="/" className="font-semibold underline">Back to the home page</Link>
          </div>
        ) : showPicker ? (
          <FirstVisitPicker onDone={() => { setNeedsPick(false); refresh(); }} />
        ) : children}
      </main>

      <nav aria-label="Driver pages" className="fixed inset-x-0 bottom-0 z-30 border-t border-bitumen-200 bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-[560px] grid-cols-3">
          <Tab href="/driver" active={tab("/driver")} icon={<CalendarCheck />}>Today</Tab>
          <Tab href="/driver/report" active={tab("/driver/report")} icon={<TriangleAlert />}>Report</Tab>
          <Tab href="/driver/truck" active={tab("/driver/truck")} icon={<UserRound />}>Me</Tab>
        </div>
      </nav>
    </DriverCtx.Provider>
  );
}

function Tab({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition",
        active ? "text-rust-600" : "text-bitumen-500 hover:text-bitumen-900",
      )}
    >
      <span className={cx("[&>svg]:h-5 [&>svg]:w-5", active && "[&>svg]:stroke-[2.4]")}>{icon}</span>
      {children}
    </Link>
  );
}

function FirstVisitPicker({ onDone }: { onDone: () => void }) {
  const { me } = useDriver();
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return <Skeleton />;
  const pick = async (id: string) => {
    setBusy(id);
    try { await api("/api/driver/me", { method: "POST", body: JSON.stringify({ truckId: id }) }); } catch { /* keep going */ }
    markTruckPicked();
    onDone();
  };
  return (
    <section className="animate-fade-up">
      <h1 className="text-2xl font-bold tracking-tight text-bitumen-900">G'day {firstName(me.user.name)}.</h1>
      <p className="mt-1 text-[15px] text-bitumen-600">Which truck are you in today?</p>
      <TruckList trucks={me.trucks} currentId={me.truck.id} busyId={busy} onPick={pick} />
    </section>
  );
}

export function TruckList({ trucks, currentId, busyId, onPick }: { trucks: TruckT[]; currentId: string | null; busyId: string | null; onPick: (id: string) => void }) {
  return (
    <ul className="mt-4 space-y-2">
      {trucks.map((t) => {
        const current = t.id === currentId;
        return (
          <li key={t.id}>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => onPick(t.id)}
              className={cx(
                "flex min-h-[64px] w-full items-center gap-3 rounded-xl border bg-white px-4 text-left shadow-card transition active:scale-[0.99]",
                current ? "border-rust-400 ring-2 ring-rust-200" : "border-bitumen-200 hover:border-bitumen-300",
              )}
            >
              <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", current ? "bg-rust-500 text-white" : "bg-bitumen-100 text-bitumen-600")}>
                <Truck className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold text-bitumen-900 tabular-nums">{t.code} {t.rego ? <span className="text-[12px] font-medium text-bitumen-400">{t.rego}</span> : null}</span>
                <span className="block truncate text-[13px] text-bitumen-500">{t.driverName ?? "No driver listed"} · {t.status === "moving" ? "on the road" : t.status === "idle" ? "at the depot" : t.status.replace(/_/g, " ")}</span>
              </span>
              {current && <span className="text-[11px] font-semibold uppercase tracking-wider text-rust-600">You</span>}
              {busyId === t.id && <span className="text-[12px] text-bitumen-400">Saving…</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Skeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="h-7 w-48 animate-pulse rounded bg-bitumen-200" />
      <div className="h-36 animate-pulse rounded-xl bg-bitumen-100" />
      <div className="h-36 animate-pulse rounded-xl bg-bitumen-100" />
    </div>
  );
}

export function firstName(name: string): string {
  const parts = name.replace(/\./g, "").split(/\s+/).filter(Boolean);
  const longest = parts.find((p) => p.length > 2) ?? parts[0] ?? "there";
  return longest;
}
