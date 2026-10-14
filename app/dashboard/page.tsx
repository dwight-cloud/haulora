import Link from "next/link";
import { ArrowUpRight, Download, MapPin, Plus, Signal } from "lucide-react";
import { Nav } from "@/components/Nav";
import { HereMap } from "@/components/HereMap";
import { LiveFleetMap } from "@/components/LiveFleetMap";
import { DispatchOps } from "@/components/DispatchOps";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { LiveEtaCell } from "@/components/LiveEtaCell";
import { DelayAlerts } from "@/components/DelayAlerts";
import {
  Button, Card, CardBody, PageHeader, Pill, SectionHeader, Stat,
} from "@/components/ui/primitives";
import { mockFleet } from "@/lib/mock-fleet";
import { getSession } from "@/lib/auth";
import { listDriversForAccount } from "@/lib/db";
import { listAssignmentsForAccount } from "@/lib/assignments";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export default async function DashboardPage() {
  const s = await getSession();
  const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY ?? "";
  const drivers = s ? listDriversForAccount(s.accountId) : [];
  const assignments = s ? listAssignmentsForAccount(s.accountId, 8) : [];
  const fleet = mockFleet.map((t, i) => ({
    ...t,
    driver: drivers[i % Math.max(1, drivers.length)]?.name ?? t.driver,
  }));
  const markers = fleet.map((t) => ({ id: t.id, lat: t.lat, lon: t.lon, label: t.name }));

  const active = fleet.filter((t) => t.status === "moving").length;
  const idle   = fleet.filter((t) => t.status === "idle").length;
  const avgFuel = Math.round(fleet.reduce((a, t) => a + t.fuelPct, 0) / fleet.length);
  const lowHos  = fleet.filter((t) => t.hosRemainingHours > 0 && t.hosRemainingHours < 4).length;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <PageHeader
          eyebrow="Fleet"
          title="Dashboard"
          subtitle={`${s?.accountName ?? "Demo fleet"} · ${fleet.length} units`}
          right={
            <>
              <Pill tone="success">
                <Signal className="h-3 w-3" /> Live
              </Pill>
              <Button icon={<Download />}>Export</Button>
            </>
          }
        />

        {/* KPI strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Active"  value={active} sub="units moving" tone="success" />
          <Stat label="Idle"    value={idle}   sub="stopped > 5 min" tone={idle > 0 ? "warning" : "neutral"} />
          <Stat label="Avg fuel" value={`${avgFuel}%`} sub="fleet average" />
          <Stat label="Low HOS" value={lowHos} sub="< 4h remaining" tone={lowHos > 0 ? "danger" : "neutral"} />
        </div>

        {/* Full-width live map — overlays driver-streamed positions on top of fallback fleet markers */}
        <Card className="mt-5 overflow-hidden p-1.5">
          <LiveFleetMap apiKey={apiKey} fallbackMarkers={markers} height="480px" />
        </Card>

        {/* Units table */}
        <section className="mt-6">
          <SectionHeader title="Units" subtitle={`${fleet.length} total`} />
          <Card className="mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Unit</th>
                  <th className="px-4 py-2.5 text-left">Driver</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Speed</th>
                  <th className="px-4 py-2.5 text-right">Fuel</th>
                  <th className="px-4 py-2.5 text-right">HOS</th>
                  <th className="px-4 py-2.5 text-left">Route</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {fleet.map((t) => {
                  const statusTone: "success" | "warning" | "neutral" =
                    t.status === "moving" ? "success" : t.status === "idle" ? "warning" : "neutral";
                  return (
                    <tr key={t.id} className="hover:bg-ink-50/60">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-ink-900 text-[10px] font-bold text-white">
                            {t.id.replace("T-", "")}
                          </span>
                          <span className="font-semibold text-ink-900">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-ink-700">{t.driver}</td>
                      <td className="px-4 py-2.5"><Pill tone={statusTone}>{statusLabel(t.status)}</Pill></td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-ink-900">{t.speedMph}</span>
                        <span className="ml-0.5 text-[11px] text-ink-500">mph</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={cx(
                          "font-mono",
                          t.fuelPct < 25 ? "text-red-600"
                          : t.fuelPct < 50 ? "text-amber-600"
                          : "text-ink-900"
                        )}>{t.fuelPct}</span>
                        <span className="ml-0.5 text-[11px] text-ink-500">%</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={cx(
                          "font-mono",
                          t.hosRemainingHours > 0 && t.hosRemainingHours < 4 ? "text-red-600" : "text-ink-900"
                        )}>{t.hosRemainingHours.toFixed(1)}</span>
                        <span className="ml-0.5 text-[11px] text-ink-500">h</span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-600">
                        <div className="inline-flex items-center gap-1 text-[13px]">
                          <MapPin className="h-3 w-3 text-ink-400" />
                          <span className="truncate">{t.origin} → {t.destination}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={{
                            pathname: "/plan",
                            query: {
                              origin: t.origin, destination: t.destination,
                              heightMeters: t.heightMeters, weightKg: t.weightKg,
                              axleCount: t.axleCount, hazardous: t.hazardous ? "1" : "0",
                              auto: "1",
                            },
                          }}
                          className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-ink-700 transition hover:text-ink-900"
                        >
                          Plan <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        {/* HERE ops: reach (isoline) + match (matrix) */}
        <DispatchOps
          apiKey={apiKey}
          trucks={fleet.map((t) => ({
            id: t.id, name: t.name, driver: t.driver,
            lat: t.lat, lon: t.lon, status: t.status,
            heightMeters: t.heightMeters, weightKg: t.weightKg,
            axleCount: t.axleCount, hazardous: t.hazardous,
          }))}
        />

        {/* Recent assignments */}
        {assignments.length > 0 && (
          <section className="mt-10">
            <SectionHeader
              title="Recent assignments"
              subtitle="Dispatched runs across the fleet"
              right={
                <Link href="/plan" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-700 hover:text-ink-900">
                  <Plus className="h-4 w-4" /> New run
                </Link>
              }
            />
            <Card className="mt-3 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-100 bg-ink-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Driver</th>
                    <th className="px-4 py-2.5 text-left">Route</th>
                    <th className="px-4 py-2.5 text-right">Miles</th>
                    <th className="px-4 py-2.5 text-right">Risk</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-right">ETA</th>
                    <th className="px-4 py-2.5 text-right">Created</th>
                    <th className="px-4 py-2.5 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {assignments.map((a) => (
                    <tr key={a.id} className="hover:bg-ink-50/60">
                      <td className="px-4 py-3 font-semibold text-ink-900">{a.driverName ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-600">{a.originLabel} → {a.destLabel}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{a.distanceMiles.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{a.riskScore}</td>
                      <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                      <td className="px-4 py-3">
                        <LiveEtaCell
                          status={a.status}
                          createdAt={a.createdAt}
                          plannedDurationHours={a.durationHours}
                          liveEtaIso={a.liveEtaIso}
                          liveDurationHours={a.liveDurationHours}
                          liveUpdatedAt={a.liveUpdatedAt}
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-ink-500">
                        {new Date(a.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.status !== "completed" && a.status !== "cancelled" && (
                          <ShareLinkButton assignmentId={a.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Integrations row */}
        <section className="mt-10">
          <SectionHeader title="Integrations" subtitle="Connect your stack" />
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              { t: "Fuel network",       s: "Connect your negotiated program" },
              { t: "511 cameras & traffic", s: "DOT feeds on the map" },
              { t: "ELD sync",           s: "Telematics providers (roadmap)" },
            ].map((x) => (
              <Card key={x.t} className="border-dashed">
                <CardBody className="flex items-center justify-between py-4">
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{x.t}</div>
                    <div className="text-xs text-ink-500">{x.s}</div>
                  </div>
                  <Pill>Coming soon</Pill>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <DelayAlerts />
    </>
  );
}

function statusLabel(s: string): string {
  if (s === "moving") return "Moving";
  if (s === "idle")   return "Idle";
  if (s === "off-duty") return "Off-duty";
  return s.replace(/_/g, " ");
}

function StatusPill({ status }: { status: string }) {
  const tone: "success" | "warning" | "info" | "neutral" | "danger" = (() => {
    switch (status) {
      case "completed":   return "success";
      case "in_progress": return "info";
      case "accepted":    return "info";
      case "assigned":    return "warning";
      case "cancelled":   return "danger";
      default:            return "neutral";
    }
  })();
  return <Pill tone={tone}>{statusLabel(status)}</Pill>;
}
