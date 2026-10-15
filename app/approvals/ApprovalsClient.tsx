"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, X } from "lucide-react";
import { Button, Card, CardBody, EmptyState, ErrorBanner, PageHeader, Pill, cx } from "@/components/ui/primitives";
import { LevyBar } from "@/app/dashboard/DashboardClient";
import type { Action, ActionStatus } from "@/lib/domain/types";
import { api, ApiError, fmtAud, fmtDateTime } from "@/lib/ui/format";
import { ACTION_KIND_PLAIN as KIND_LABEL, ACTION_STATUS_PLAIN, agentName, plainText } from "@/lib/ui/plain";
import { Term } from "@/components/Term";

type Tab = "proposed" | "executed" | "rejected";
const TABS: Array<{ id: Tab; label: string; statuses: ActionStatus[] }> = [
  { id: "proposed", label: "Waiting for you", statuses: ["proposed"] },
  { id: "executed", label: "Accepted", statuses: ["executed", "auto_executed", "approved"] },
  { id: "rejected", label: "Declined", statuses: ["rejected", "failed"] },
];
const RISK_WORD: Record<string, string> = { low: "small change", medium: "medium change", high: "big change" };

export function ApprovalsClient() {
  const [all, setAll] = useState<Action[] | null>(null);
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
      setAll((xs) => (xs ?? []).map((a) => (a.id === id ? r.action : a)));
    } catch (e) { setError(e instanceof Error ? e.message : "Decision failed"); }
    finally { setBusy(null); }
  }

  const list = all ?? [];
  const counts = Object.fromEntries(TABS.map((t) => [t.id, list.filter((a) => t.statuses.includes(a.status)).length])) as Record<Tab, number>;
  const visible = list.filter((a) => TABS.find((t) => t.id === tab)!.statuses.includes(a.status));
  const pendingImpact = list.filter((a) => a.status === "proposed").reduce((s, a) => s + (a.impactAud || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Your fleet" title="Your decisions" subtitle={<>Suggestions from the AI helpers that need your yes or no.{all ? <> {counts.proposed} waiting for you · {fmtAud(pendingImpact)} at stake.</> : null}</>} />
      <div data-tour="decisions" className="rounded-xl border border-rust-200 bg-rust-50/60 px-4 py-3 text-[14px] leading-6 text-bitumen-700">
        <span className="font-semibold text-bitumen-900">The AI helpers suggest, you decide.</span> Accepting makes the change straight away; declining throws it away.
        Small housekeeping, like a note to a customer, is recorded for you automatically. <span className="text-bitumen-500">Why this matters: nothing in Haulora changes a price, a route or a delivery job without you signing it off here.</span>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div role="tablist" aria-label="Which decisions to show" className="inline-flex max-w-full rounded-lg border border-bitumen-200 bg-white p-1 text-sm">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cx("inline-flex min-h-[40px] items-center rounded-md px-3 font-semibold transition", tab === t.id ? "bg-bitumen-900 text-white" : "text-bitumen-500 hover:text-bitumen-900")}>
            {t.label} <span className={cx("ml-1.5 rounded-full px-1.5 font-mono text-[11px] tabular-nums", tab === t.id ? "bg-white/15 text-white" : "bg-bitumen-100 text-bitumen-500")}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {all === null ? (
        <div className="grid gap-3 lg:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl border border-bitumen-200 bg-bitumen-50" />)}</div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            title={tab === "proposed" ? "Nothing is waiting for you" : tab === "executed" ? "Nothing accepted yet" : "Nothing declined"}
            body={tab === "proposed" ? "When an AI helper suggests something, it lands here with the numbers and the customer note ready." : "Decisions you make on the 'Waiting for you' tab show up here."}
            action={<Link href="/dashboard#step-1-title" className="inline-flex min-h-[44px] items-center rounded-lg bg-rust-500 px-4 text-sm font-semibold text-white hover:bg-rust-600">Try something going wrong on the Overview</Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((a) => <ActionCard key={a.id} a={a} busy={busy === a.id} onDecide={decide} />)}
        </div>
      )}
    </div>
  );
}

function ActionCard({ a, busy, onDecide }: { a: Action; busy: boolean; onDecide: (id: string, d: "approve" | "reject") => void }) {
  const payload = (a.payload as { kind?: string; data?: Record<string, unknown> } | null) ?? {};
  const data = payload.data ?? {};
  const riskTone = a.risk === "high" ? "danger" : a.risk === "medium" ? "warning" : "success";
  const statusTone = a.status === "proposed" ? "accent" : a.status === "rejected" || a.status === "failed" ? "danger" : "success";
  const impactLabel = a.kind === "rate_card_update" ? "a week" : a.impactAud ? "worth of goods" : "";

  return (
    <Card className="flex flex-col">
      <CardBody className="flex flex-1 flex-col p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="neutral">{agentName(a.agent)}</Pill>
          <Pill tone="neutral">{KIND_LABEL[a.kind] ?? a.kind.replace(/_/g, " ")}</Pill>
          <Pill tone={riskTone} filled>{RISK_WORD[a.risk] ?? a.risk}</Pill>
          {a.status !== "proposed" && <Pill tone={statusTone} filled>{ACTION_STATUS_PLAIN[a.status] ?? a.status.replace("_", " ")}</Pill>}
        </div>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0 text-[15px] font-semibold leading-6 text-bitumen-900">{plainText(a.title)}</div>
          {a.impactAud ? (
            <div className="shrink-0 text-right">
              <div className="text-2xl font-bold tracking-tight text-bitumen-900 tabular-nums">{fmtAud(a.impactAud, { sign: a.kind === "rate_card_update" })}</div>
              <div className="text-[11px] text-bitumen-400">{impactLabel}</div>
            </div>
          ) : null}
        </div>
        {a.description && <p className="mt-1 text-[13px] leading-6 text-bitumen-600">{plainText(a.description)}</p>}

        <Detail a={a} data={data} />

        <div className="mt-3 text-xs text-bitumen-400">
          Suggested {fmtDateTime(a.createdAt)}
          {a.decidedAt && <> · {ACTION_STATUS_PLAIN[a.status] ?? a.status.replace("_", " ")} {fmtDateTime(a.decidedAt)}{a.decidedBy ? ` by ${a.decidedBy}` : ""}</>}
          {a.result && <> · {plainText(a.result)}</>}
        </div>

        {a.status === "proposed" && (
          <div className="mt-4 flex gap-2">
            <Button tone="accent" className="flex-1" disabled={busy} icon={busy ? <Loader2 className="animate-spin" /> : <Check />} onClick={() => onDecide(a.id, "approve")}>Accept</Button>
            <Button className="flex-1" disabled={busy} icon={<X />} onClick={() => onDecide(a.id, "reject")}>Decline</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Detail({ a, data }: { a: Action; data: Record<string, unknown> }) {
  if (a.kind === "rate_card_update") {
    return (
      <div className="mt-2">
        <LevyBar oldPct={Number(data.oldLevyPct)} newPct={Number(data.newLevyPct)} />
        <div className="mt-2 text-xs text-bitumen-500">The new <Term t="fuel levy" /> starts {String(data.effectiveDate ?? "—")}, after the notice period in the contract.</div>
        {typeof data.noticeBody === "string" && <Quote label="Note to the customer, ready to send" text={data.noticeBody} />}
      </div>
    );
  }
  if (a.kind === "replan_load") {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
        <Fact v={`${Number(data.km).toFixed(0)} km`} k="new route length" />
        <Fact v={`${Number(data.hours).toFixed(1)} h`} k="driving time" />
        {data.eventId ? <Fact v="1" k="closure avoided" /> : null}
      </div>
    );
  }
  if (a.kind === "flag_for_review") {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-6 text-amber-950">
        <div className="font-semibold">{plainText(String(data.subject ?? ""))}</div>
        <div>{plainText(String(data.detail ?? ""))}</div>
      </div>
    );
  }
  if (a.kind === "customer_notice") {
    return <Quote label={`${plainText(String(data.subject ?? "Note"))} · ${String(data.channel ?? "email")}`} text={String(data.body ?? "")} />;
  }
  if (a.kind === "hold_load") {
    return <div className="mt-3 text-[13px] leading-6 text-bitumen-700"><span className="font-semibold text-bitumen-900">Why wait at the depot:</span> {plainText(String(data.reason ?? ""))}</div>;
  }
  return null;
}

function Fact({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-lg border border-bitumen-200 bg-bitumen-50 px-2 py-2">
      <div className="text-base font-bold text-bitumen-900 tabular-nums">{v}</div>
      <div className="text-[11px] text-bitumen-500">{k}</div>
    </div>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }
  return (
    <figure className="mt-3 rounded-lg border-l-4 border-rust-300 bg-bitumen-50 px-4 py-3">
      <figcaption className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-bitumen-500">
        {label}
        <button type="button" onClick={copy} className="inline-flex min-h-[32px] items-center gap-1 rounded-md px-1.5 normal-case tracking-normal text-bitumen-600 hover:text-bitumen-900">
          <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <blockquote className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-bitumen-800">{text}</blockquote>
    </figure>
  );
}
