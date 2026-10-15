"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "./ui/primitives";

/**
 * Five-stop guided tour. A stop names a page and a `data-tour` target; when
 * the stop lives on another page the tour stores its position in
 * sessionStorage, navigates, and resumes once the target is on screen.
 * Completion is remembered in localStorage. Start it from anywhere with
 * `window.dispatchEvent(new CustomEvent("haulio:tour:start"))`.
 */

interface Stop { path: string; target: string; title: string; body: string }

const STOPS: Stop[] = [
  { path: "/dashboard", target: "overview-numbers", title: "Your numbers, right now", body: "Loads on the road, trucks moving, today's diesel price, road problems, and how many proposals are waiting for you. These refresh every few seconds." },
  { path: "/dashboard", target: "scenarios", title: "Step 1: try something going wrong", body: "Each button is a safe, pretend shock to the business: a diesel spike, a highway flood, two sick drivers. Pressing one wakes the AI agent that handles it. 'Start again' puts everything back." },
  { path: "/dashboard", target: "agent-story", title: "Step 2: watch the agent think", body: "Every line is one thing the agent did, in order: what it read, what it worked out, what it proposes. It can look and suggest, but it cannot change anything itself." },
  { path: "/decisions", target: "decisions", title: "Decisions: you have the final say", body: "Every proposal lands here with the numbers and the customer notice already drafted. Approve applies it immediately; reject throws it away. Nothing happens until you press one." },
  { path: "/customers", target: "levy-chips", title: "Customers: is the fuel levy up to date?", body: "Each card compares the levy you are charging with what the contract says it should be at today's diesel price. A red chip means money being left on the table; the fuel agent proposes the fix." },
];

const DONE_KEY = "haulio.tour.done";
const STEP_KEY = "haulio.tour.step";
const PAD = 8;

export function Tour() {
  const pathname = usePathname();
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);

  // Resume after navigation, or start on request.
  useEffect(() => {
    try {
      const s = sessionStorage.getItem(STEP_KEY);
      if (s != null) { const n = Number(s); if (Number.isInteger(n) && STOPS[n]) setStep(n); }
    } catch { /* ignore */ }
    const onStart = () => { setStep(0); };
    window.addEventListener("haulio:tour:start", onStart);
    return () => window.removeEventListener("haulio:tour:start", onStart);
  }, []);

  const stop = step != null ? STOPS[step] : null;

  // Navigate when the stop lives on another page.
  useEffect(() => {
    if (!stop) return;
    if (pathname !== stop.path) {
      try { sessionStorage.setItem(STEP_KEY, String(step)); } catch { /* ignore */ }
      router.push(stop.path);
    }
  }, [stop, step, pathname, router]);

  // Locate the target (poll briefly; pages load their data asynchronously) and track it.
  useEffect(() => {
    if (!stop || pathname !== stop.path) { setRect(null); return; }
    let tries = 0;
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    setMissing(false);
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${stop.target}"]`);
      if (!el) { if (++tries > 40) { setMissing(true); setRect(null); } return; }
      if (timer) { clearInterval(timer); timer = null; el.scrollIntoView({ block: "center", behavior: "smooth" }); }
      setRect(el.getBoundingClientRect());
      raf = requestAnimationFrame(measure);
    };
    timer = setInterval(measure, 100);
    measure();
    return () => { if (timer) clearInterval(timer); cancelAnimationFrame(raf); };
  }, [stop, pathname]);

  useEffect(() => { if (rect) document.querySelector<HTMLButtonElement>("[data-tour-next]")?.focus({ preventScroll: true }); }, [rect, step]);

  const finish = useCallback((completed: boolean) => {
    setStep(null); setRect(null);
    try { sessionStorage.removeItem(STEP_KEY); if (completed) localStorage.setItem(DONE_KEY, "1"); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (step == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
      if (e.key === "ArrowRight") setStep((s) => (s != null && s < STOPS.length - 1 ? s + 1 : s));
      if (e.key === "ArrowLeft") setStep((s) => (s != null && s > 0 ? s - 1 : s));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [step, finish]);

  if (step == null || !stop) return null;
  const last = step === STOPS.length - 1;
  const navigating = pathname !== stop.path;

  // Card placement: below the target if there is room, else above, else centred.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(380, vw - 32);
  let cardStyle: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: cardW };
  if (rect) {
    const left = Math.max(16, Math.min(rect.left, vw - cardW - 16));
    if (rect.bottom + 220 < vh) cardStyle = { left, top: rect.bottom + PAD + 8, width: cardW };
    else if (rect.top > 240) cardStyle = { left, bottom: vh - rect.top + PAD + 8, width: cardW };
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`Guided tour, stop ${step + 1} of ${STOPS.length}`}>
      {rect ? (
        <div
          aria-hidden
          className="absolute rounded-xl ring-2 ring-rust-500 transition-all duration-200"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgba(28,26,23,0.62)" }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-bitumen-900/60" />
      )}
      <div className="absolute rounded-2xl border border-bitumen-200 bg-white p-4 shadow-card-lg animate-fade-up" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rust-600">Stop {step + 1} of {STOPS.length}</div>
          <button type="button" onClick={() => finish(false)} aria-label="Skip tour" className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-bitumen-500 hover:bg-bitumen-50 hover:text-bitumen-900"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-1 text-[15px] font-bold leading-5 text-bitumen-900">{stop.title}</div>
        <p className="mt-1.5 text-[13px] leading-5 text-bitumen-700">{stop.body}</p>
        {navigating && <p className="mt-2 text-[12px] text-bitumen-500">Opening {stop.path.replace("/", "")}…</p>}
        {missing && !navigating && <p className="mt-2 text-[12px] text-bitumen-500">This part is still loading; the description above still applies.</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => finish(false)} className="text-[12px] font-semibold text-bitumen-500 hover:text-bitumen-900">Skip</button>
          <div className="flex gap-2">
            <Button size="sm" disabled={step === 0} icon={<ChevronLeft />} onClick={() => setStep((s) => (s ?? 1) - 1)}>Back</Button>
            <Button data-tour-next size="sm" tone="accent" onClick={() => (last ? finish(true) : setStep((s) => (s ?? 0) + 1))}>
              {last ? "Done" : "Next"}{!last && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function tourCompleted(): boolean {
  try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return false; }
}
