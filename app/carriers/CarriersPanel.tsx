"use client";

import { useState } from "react";

interface Carrier {
  dotNumber: number; legalName: string; dbaName?: string; status: string;
  allowedToOperate: boolean; entityType?: string; classification?: string;
  mcNumber?: string; phyAddress?: string;
  totalDrivers?: number; totalPowerUnits?: number;
  safetyRating?: string; safetyRatingDate?: string;
  insuranceOnFile?: boolean; insuranceRequired?: boolean;
  operationClassification?: string[];
  recentCrashes?: { fatal?: number; injury?: number; tow?: number; total?: number };
  recentInspections?: {
    vehicleOosPct?: number; driverOosPct?: number; hazmatOosPct?: number;
    vehicleOosNational?: number; driverOosNational?: number; hazmatOosNational?: number;
  };
}

export function CarriersPanel() {
  const [dot, setDot] = useState("");
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setCarrier(null); setErr(null); setLoading(true);
    try {
      const r = await fetch(`/api/safer/${encodeURIComponent(dot)}`);
      if (r.status === 404) throw new Error(`DOT ${dot} not found in FMCSA SAFER`);
      if (!r.ok) throw new Error(`lookup failed (${r.status})`);
      const d = await r.json();
      setCarrier(d.carrier);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-3xl font-black">Carrier lookup</h1>
      <p className="text-ink-500">FMCSA SAFER snapshot — authority, safety rating, insurance, fleet size.</p>

      <section className="mt-6 flex gap-2">
        <input
          className="input max-w-[240px]"
          placeholder="USDOT number"
          value={dot}
          onChange={(e) => setDot(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <button
          onClick={lookup} disabled={!dot || loading}
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-offwhite disabled:opacity-50"
        >
          {loading ? "Looking up…" : "Look up"}
        </button>
      </section>

      {err && <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {carrier && (
        <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xl font-black">{carrier.legalName}</div>
              {carrier.dbaName && <div className="text-sm text-ink-500">DBA {carrier.dbaName}</div>}
              <div className="mt-1 text-xs text-ink-500">DOT {carrier.dotNumber}{carrier.mcNumber ? ` · MC ${carrier.mcNumber}` : ""}</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${
              carrier.allowedToOperate ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"
            }`}>
              {carrier.allowedToOperate ? "Authorized" : "Out of service"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Safety rating" value={carrier.safetyRating?.toUpperCase() || "—"} />
            <Stat label="Drivers" value={carrier.totalDrivers?.toLocaleString() ?? "—"} />
            <Stat label="Power units" value={carrier.totalPowerUnits?.toLocaleString() ?? "—"} />
            <Stat label="Insurance" value={carrier.insuranceOnFile ? "On file" : "—"} />
          </div>

          {carrier.phyAddress && (
            <div className="mt-4 text-sm text-ink-600">{carrier.phyAddress}</div>
          )}
          {carrier.entityType && (
            <div className="mt-1 text-xs text-ink-500">Operation: {carrier.entityType}</div>
          )}
          {carrier.classification && (
            <div className="mt-0.5 text-xs text-ink-500">Classification: {carrier.classification}</div>
          )}
          {carrier.safetyRatingDate && (
            <div className="mt-0.5 text-xs text-ink-500">Safety rating issued: {carrier.safetyRatingDate}</div>
          )}

          {carrier.recentCrashes && (carrier.recentCrashes.total ?? 0) > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Crashes (24 mo)</div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <Stat label="Fatal" value={String(carrier.recentCrashes.fatal ?? 0)} />
                <Stat label="Injury" value={String(carrier.recentCrashes.injury ?? 0)} />
                <Stat label="Tow" value={String(carrier.recentCrashes.tow ?? 0)} />
                <Stat label="Total" value={String(carrier.recentCrashes.total ?? 0)} />
              </div>
            </div>
          )}

          {carrier.recentInspections && (
            (carrier.recentInspections.vehicleOosPct != null ||
             carrier.recentInspections.driverOosPct != null ||
             carrier.recentInspections.hazmatOosPct != null) && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Out-of-service % (last 24 mo · lower is better)</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <OosStat label="Vehicle" carrier={carrier.recentInspections.vehicleOosPct} national={carrier.recentInspections.vehicleOosNational} />
                <OosStat label="Driver" carrier={carrier.recentInspections.driverOosPct} national={carrier.recentInspections.driverOosNational} />
                <OosStat label="Hazmat" carrier={carrier.recentInspections.hazmatOosPct} national={carrier.recentInspections.hazmatOosNational} />
              </div>
            </div>
          ))}
        </section>
      )}

      <style jsx global>{`
        .input { border: 1px solid rgba(11,30,63,0.2); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
      `}</style>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</div>
      <div className="mt-1 font-black">{value}</div>
    </div>
  );
}

function OosStat({ label, carrier, national }: { label: string; carrier?: number; national?: number }) {
  const better = carrier != null && national != null && carrier < national;
  const worse = carrier != null && national != null && carrier > national;
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</div>
      <div className={`mt-1 font-black ${better ? "text-green-600" : worse ? "text-red-600" : ""}`}>
        {carrier != null ? `${carrier}%` : "—"}
      </div>
      {national != null && <div className="text-[10px] text-ink-500">nat'l avg {national}%</div>}
    </div>
  );
}
