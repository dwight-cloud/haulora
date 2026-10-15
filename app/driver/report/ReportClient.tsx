"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Car, CheckCircle2, CloudRain, Flame, Loader2, LocateFixed, OctagonX, Send, Waves, Weight, Building2 } from "lucide-react";
import { useDriver } from "@/components/driver/DriverShell";
import { cx } from "@/components/ui/primitives";
import { api } from "@/lib/ui/format";
import { plainText } from "@/lib/ui/plain";
import type { AgentRun, AgentStep, RoadEvent } from "@/lib/domain/types";

type Kind = "flood" | "closure" | "crash" | "fire" | "weather" | "restriction";
type Sev = "moderate" | "major" | "critical";

const KINDS: Array<{ id: Kind; label: string; icon: React.ReactNode }> = [
  { id: "flood",       label: "Flooding",      icon: <Waves /> },
  { id: "closure",     label: "Road closed",   icon: <OctagonX /> },
  { id: "crash",       label: "Crash",         icon: <Car /> },
  { id: "fire",        label: "Fire / smoke",  icon: <Flame /> },
  { id: "weather",     label: "Bad weather",   icon: <CloudRain /> },
  { id: "restriction", label: "Truck limit",   icon: <Weight /> },
];
const SEVS: Array<{ id: Sev; label: string; desc: string; tone: string }> = [
  { id: "moderate", label: "Slow",            desc: "Getting through, but slowly",  tone: "border-amber-300 bg-amber-50 text-amber-900" },
  { id: "major",    label: "One lane",        desc: "One lane open, long delays",   tone: "border-orange-300 bg-orange-50 text-orange-900" },
  { id: "critical", label: "Road closed",     desc: "Nothing is getting through",   tone: "border-red-300 bg-red-50 text-red-900" },
];
const ROADS = ["Bruce Highway", "Warrego Highway", "Flinders Highway", "Capricorn Highway", "Pacific Motorway"];

interface Result { event: RoadEvent; run: { run: AgentRun; steps: AgentStep[] } }

export function ReportClient() {
  const params = useSearchParams();
  const { me, refresh } = useDriver();
  const [kind, setKind] = useState<Kind | null>(null);
  const [road, setRoad] = useState("");
  const [sev, setSev] = useState<Sev | null>(null);
  const [note, setNote] = useState("");
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [posMsg, setPosMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "sending" | "done">("form");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobRef = params.get("job") ?? "";

  useEffect(() => { const r = params.get("road"); if (r) setRoad(r); }, [params]);
  useEffect(() => {
    if (phase !== "sending") return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase]);

  const useLocation = () => {
    if (!navigator.geolocation) { setPosMsg("This phone cannot share its location."); return; }
    setPosMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude }); setPosMsg("Using your phone's location."); },
      () => setPosMsg("Location is off. Dispatch will use the truck's last known spot."),
      { timeout: 10_000 },
    );
  };

  const canSend = kind && sev && note.trim().length > 0 && phase === "form";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setPhase("sending"); setError(null);
    try {
      const r = await api<Result>("/api/driver/report", { method: "POST", body: JSON.stringify({ kind, road: road.trim() || undefined, note: note.trim(), severity: sev, lat: pos?.lat, lon: pos?.lon, loadRef: jobRef || undefined }) });
      setResult(r); setPhase("done"); refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report");
      setPhase("form");
    }
  };

  if (phase === "sending") {
    return (
      <div className="animate-fade-up rounded-2xl border border-bitumen-200 bg-white p-6 text-center shadow-card">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rust-50">
          <Loader2 className="h-8 w-8 animate-spin text-rust-500" />
        </div>
        <h1 className="mt-4 text-[20px] font-bold text-bitumen-900">Sent to dispatch.</h1>
        <p className="mt-1.5 text-[15px] leading-6 text-bitumen-600">The AI helper is checking every job on that road…</p>
        <ol className="mx-auto mt-5 max-w-[280px] space-y-2 text-left text-[13px] text-bitumen-700">
          <Step done={elapsed > 1}>Road problem recorded</Step>
          <Step done={elapsed > 6}>Finding the jobs that go through it</Step>
          <Step done={elapsed > 14}>Looking for a truck-legal way around</Step>
          <Step done={false}>Writing up what to do</Step>
        </ol>
        <div className="mt-4 text-[12px] tabular-nums text-bitumen-400">{elapsed}s · usually under a minute</div>
      </div>
    );
  }

  if (phase === "done" && result) {
    const r = result.run.run;
    const proposals = result.run.steps.filter((s) => s.kind === "proposal").length;
    const ok = r.status === "completed";
    return (
      <div className="animate-fade-up space-y-4">
        <div className="rounded-2xl border border-gum-200 bg-white p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gum-50 text-gum-600"><CheckCircle2 className="h-7 w-7" /></span>
            <div>
              <h1 className="text-[18px] font-bold text-bitumen-900">Dispatch has your report</h1>
              <div className="text-[13px] text-bitumen-500">{plainText(result.event.title)}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-bitumen-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-bitumen-400">What the road AI helper found</div>
            <p className="mt-1.5 whitespace-pre-line text-[14px] leading-6 text-bitumen-800">
              {ok ? plainText(r.summary) || "Checked every job on that road. No change needed right now." : plainText(r.error) || "The helper could not finish its check. Dispatch has your report and will look by hand."}
            </p>
            {proposals > 0 && <div className="mt-2 text-[12px] font-semibold text-rust-700">{proposals} {proposals === 1 ? "suggestion" : "suggestions"} sent to the office for a decision.</div>}
          </div>
          <p className="mt-4 text-[14px] font-semibold text-bitumen-900">Dispatch will confirm any change to your trip.</p>
        </div>
        <Link href="/driver" className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-bitumen-900 text-[15px] font-semibold text-white">Back to today</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="animate-fade-up space-y-5">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-rust-600">Report</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-bitumen-900">What's wrong with the road?</h1>
        <p className="mt-0.5 text-[14px] text-bitumen-500">
          {jobRef ? <>For your trip <span className="font-semibold text-bitumen-800">{jobRef}</span>. </> : null}
          Dispatch and the AI helper see it straight away.
        </p>
      </div>

      <fieldset>
        <legend className="text-[13px] font-semibold text-bitumen-900">What is it?</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => setKind(k.id)} aria-pressed={kind === k.id}
              className={cx("flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border bg-white text-[12px] font-semibold transition active:scale-[0.98] [&>svg]:h-6 [&>svg]:w-6",
                kind === k.id ? "border-rust-500 bg-rust-50 text-rust-800 ring-2 ring-rust-200" : "border-bitumen-200 text-bitumen-700")}>
              {k.icon}{k.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="road" className="text-[13px] font-semibold text-bitumen-900">Which road?</label>
        <input id="road" list="roads" value={road} onChange={(e) => setRoad(e.target.value)} placeholder="Bruce Highway near Ingham" className="input mt-2 min-h-[48px] text-[16px]" autoComplete="off" />
        <datalist id="roads">{ROADS.map((r) => <option key={r} value={r} />)}</datalist>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROADS.map((r) => (
            <button key={r} type="button" onClick={() => setRoad(r)} className={cx("min-h-[36px] rounded-full border px-3 text-[12px] font-medium", road === r ? "border-bitumen-900 bg-bitumen-900 text-white" : "border-bitumen-200 bg-white text-bitumen-700")}>{r}</button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="text-[13px] font-semibold text-bitumen-900">How bad?</legend>
        <div className="mt-2 grid gap-2">
          {SEVS.map((s) => (
            <button key={s.id} type="button" onClick={() => setSev(s.id)} aria-pressed={sev === s.id}
              className={cx("flex min-h-[56px] items-center justify-between rounded-xl border px-4 text-left transition active:scale-[0.99]",
                sev === s.id ? `${s.tone} ring-2 ring-offset-1 ring-bitumen-900/20` : "border-bitumen-200 bg-white text-bitumen-700")}>
              <span className="text-[15px] font-bold">{s.label}</span>
              <span className="text-[12px] opacity-80">{s.desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="note" className="text-[13px] font-semibold text-bitumen-900">What can you see?</label>
        <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} placeholder="Water over the road at the Herbert River bridge, police turning trucks around." className="input mt-2 text-[16px]" />
      </div>

      <div>
        <button type="button" onClick={useLocation} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-bitumen-200 bg-white text-[14px] font-semibold text-bitumen-800">
          <LocateFixed className="h-4 w-4 text-rust-500" /> {pos ? "Location added" : "Use my location"} <span className="text-[12px] font-normal text-bitumen-400">(optional)</span>
        </button>
        {posMsg && <div className="mt-1 text-center text-[12px] text-bitumen-500">{posMsg}</div>}
        {!pos && me && <div className="mt-1 flex items-center justify-center gap-1 text-center text-[12px] text-bitumen-400"><Building2 className="h-3 w-3" /> Otherwise dispatch uses {me.truck.code}'s last known spot.</div>}
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">{error}</div>}

      <button type="submit" disabled={!canSend} className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-rust-500 text-[17px] font-bold text-white shadow-glow transition hover:bg-rust-600 disabled:opacity-40 disabled:shadow-none">
        <Send className="h-5 w-5" /> Send to dispatch
      </button>
    </form>
  );
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className={cx("flex items-center gap-2", done ? "text-gum-700" : "text-bitumen-400")}>
      {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border-2 border-current" />}
      {children}
    </li>
  );
}
