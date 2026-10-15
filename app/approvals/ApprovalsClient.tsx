"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { Button, Card, CardBody, PageHeader, Pill } from "@/components/ui/primitives";
import type { Action, ActionStatus } from "@/lib/domain/types";
import { api, ApiError, fmtAud, fmtDateTime } from "@/lib/ui/format";

type Tab = "proposed" | "executed" | "rejected";
const TABS: Array<{ id: Tab; label: string; statuses: ActionStatus[] }> = [
  { id: "proposed", label: "Proposed", statuses: ["proposed"] },
  { id: "executed", label: "Executed", statuses: ["executed", "auto_executed", "approved"] },
  { id: "rejected", label: "Rejected", statuses: ["rejected", "failed"] },
];

const KIND_LABEL: Record<string, string> = {
  rate_card_update: "Rate card", replan_load: "Re-route", hold_load: "Hold", flag_for_review: "Review", customer_notice: "Notice",
};

export function ApprovalsClient() {
  const [all, setAll] = useState<Action[]>([]);
  const [tab, setTab] = useState<Tab>("proposed");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setAll((await api<{ actions: Action[] }>("/api/actions")).actions); setError(null); }
    catch (e) { if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : "Load failed"); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 10000); return () => clearInterval(t); }, [refresh]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id); setError(null);
    try {
      const r = await api<{ action: Action }>(`/api/actions/${id}`, { method: "POST", body: JSON.stringify({ decision }) });
      setAll((xs) => xs.map((a) => (a.id === id ? r.action : a)));
    } catch (e) { setError(e instanceof Error ? e.message : "Decision failed"); }
    finally { setBusy(null); }
  }

  const counts = Object.fromEntries(TABS.map((t) => [t.id, all.filter((a) => t.statuses.includes(a.status)).length])) as Record<Tab, number>;
  const visible = all.filter((a) => TABS.find((t) => t.id === tab)!.statuses.includes(a.status));
  const pendingImpact = all.filter((a) => a.status === "proposed").reduce((s, a) => s + (a.impactAud || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Copilot" title="Approvals" subtitle={`${counts.proposed} waiting · ${fmtAud(pendingImpact)} at stake`} />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      <div className="inline-flex rounded-lg border border-ink-200 bg-white p-1 text-sm">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${tab === t.id ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-900"}`}>
            {t.label} <span className={`ml-1 font-mono text-[11px] ${tab === t.id ? "text-white/70" : "text-ink-400"}`}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card><CardBody className="py-10 text-center text-sm text-ink-400">Nothing here{tab === "proposed" ? ". Run a scenario from the dashboard." : "."}</CardBody></Card>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => <ActionCard key={a.id} a={a} busy={busy === a.id} onDecide={decide} />)}
        </div>
      )}
    </div>
  );
}

function ActionCard({ a, busy, onDecide }: { a: Action; busy: boolean; onDecide: (id: string, d: "approve" | "reject") => void }) {
  const [open, setOpen] = useState(false);
  const payload = (a.payload as { kind?: string; data?: Record<string, unknown> } | null) ?? {};
  const data = payload.data ?? {};
  const riskTone = a.risk === "high" ? "danger" : a.risk === "medium" ? "warning" : "neutral";
  const statusTone = a.status === "proposed" ? "info" : a.status === "rejected" || a.status === "failed" ? "danger" : "success";
  const impactLabel = a.kind === "rate_card_update" ? "per week" : a.impactAud ? "cargo value" : "";

  return (
    <Card>
      <CardBody className="p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone="neutral">{a.agent}</Pill>
              <Pill tone="neutral">{KIND_LABEL[a.kind] ?? a.kind}</Pill>
              <Pill tone={riskTone}>{a.risk} risk</Pill>
              {a.status !== "proposed" && <Pill tone={statusTone}>{a.status.replace("_", " ")}</Pill>}
            </div>
            <div className="mt-2 text-[15px] font-semibold leading-6 text-ink-900">{a.title}</div>
            {a.description && <p className="mt-1 text-[13px] leading-6 text-ink-600">{a.description}</p>}

            <Detail a={a} data={data} open={open} setOpen={setOpen} />

            <div className="mt-2 text-xs text-ink-400">
              Proposed {fmtDateTime(a.createdAt)}
              {a.decidedAt && <> · {a.status.replace("_", " ")} {fmtDateTime(a.decidedAt)}{a.decidedBy ? ` by ${a.decidedBy}` : ""}</>}
              {a.result && <> · {a.result}</>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4 md:flex-col md:items-end">
            {a.impactAud ? (
              <div className="text-right">
                <div className="text-lg font-bold tracking-tight text-ink-900">{fmtAud(a.impactAud, { sign: a.kind === "rate_card_update" })}</div>
                <div className="text-[11px] text-ink-400">{impactLabel}</div>
              </div>
            ) : null}
            {a.status === "proposed" && (
              <div className="flex gap-1.5">
                <Button tone="primary" size="sm" disabled={busy} icon={busy ? <Loader2 className="animate-spin" /> : <Check />} onClick={() => onDecide(a.id, "approve")}>Approve</Button>
                <Button size="sm" disabled={busy} icon={<X />} onClick={() => onDecide(a.id, "reject")}>Reject</Button>
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function Detail({ a, data, open, setOpen }: { a: Action; data: Record<string, unknown>; open: boolean; setOpen: (v: boolean) => void }) {
  if (a.kind === "rate_card_update") {
    return (
      <div className="mt-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip k="Levy" v={`${Number(data.oldLevyPct).toFixed(1)}% → ${Number(data.newLevyPct).toFixed(1)}%`} />
          <Chip k="Effective" v={String(data.effectiveDate ?? "—")} />
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ink-600 hover:text-ink-900">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Drafted customer notice
        </button>
        {open && (
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-ink-200 bg-ink-50 p-4 font-sans text-[13px] leading-6 text-ink-800">{String(data.noticeBody ?? "")}</pre>
        )}
      </div>
    );
  }
  if (a.kind === "replan_load") {
    return (
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Chip k="Detour" v={`${Number(data.km).toFixed(0)} km`} />
        <Chip k="Hours" v={`${Number(data.hours).toFixed(1)} h`} />
        {data.eventId ? <Chip k="Event" v={String(data.eventId)} /> : null}
      </div>
    );
  }
  if (a.kind === "flag_for_review") {
    return (
      <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[13px] leading-6">
        <div className="font-semibold text-ink-900">{String(data.subject ?? "")}</div>
        <div className="text-ink-700">{String(data.detail ?? "")}</div>
      </div>
    );
  }
  if (a.kind === "customer_notice") {
    return (
      <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[13px] leading-6">
        <div className="font-semibold text-ink-900">{String(data.subject ?? "")} <span className="font-normal text-ink-400">· {String(data.channel ?? "email")}</span></div>
        <div className="text-ink-700">{String(data.body ?? "")}</div>
      </div>
    );
  }
  if (a.kind === "hold_load") {
    return <div className="mt-3 text-[13px] text-ink-700">Hold reason: {String(data.reason ?? "")}</div>;
  }
  return null;
}

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md border border-ink-200 bg-white px-2 py-0.5">
      <span className="text-ink-400">{k}</span><span className="font-mono font-semibold text-ink-800">{v}</span>
    </span>
  );
}
