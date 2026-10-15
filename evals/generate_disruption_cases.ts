/**
 * Deterministic generator for evals/disruption_cases.json (50 golden cases for
 * the disruption agent's triage decision). No randomness: cases are built from
 * fixed catalogues combined by index arithmetic, so re-running always yields
 * byte-identical output.
 *
 * Run: npx tsx evals/generate_disruption_cases.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Decision = "reroute" | "hold" | "proceed" | "escalate";
type Priority = "essential" | "perishable" | "standard";
type LoadStatus = "planned" | "en_route" | "delayed" | "rerouted";
type Kind = "closure" | "flood" | "fire" | "crash" | "restriction" | "weather";
type Severity = "minor" | "moderate" | "major" | "critical";

interface CaseInput {
  load: {
    ref: string; status: LoadStatus; originLabel: string; destLabel: string; dueAtIso: string;
    tonnes: number; valueAud: number; perishable: boolean; essential: boolean;
    /** Hours of driving still ahead on the current route (whole trip if planned). */
    plannedHours: number;
  };
  event: {
    kind: Kind; severity: Severity; road: string; title: string;
    nearestKm: number; radiusKm: number; endsAtIso: string | null;
  };
  detourHoursIfRerouted: number | null;
  nowIso: string;
}
interface Expected {
  decision: Decision; reason: string; customerNoticeRequired: boolean; priority: Priority;
}
interface Case { id: string; input: CaseInput; expected: Expected }

const RULES = {
  description:
    "Triage rules for a load whose route passes near a road/weather event. Evaluate in order; the first matching rule wins.",
  order: [
    "1. proceed: event.nearestKm > event.radiusKm (route does not enter the zone) OR event.severity == 'minor'.",
    "2. escalate: event.severity == 'critical' AND load.status == 'en_route' (truck is already inside / committed to the affected zone).",
    "3. reroute: detourHoursIfRerouted is a number AND nowIso + load.plannedHours + detourHoursIfRerouted <= load.dueAtIso.",
    "4. escalate: (no detour, or the detour misses dueAtIso) AND (load.essential OR load.perishable).",
    "5. hold: otherwise (no detour or detour misses due time, and the load is neither essential nor perishable).",
  ],
  customerNoticeRequired: "true whenever decision != 'proceed'.",
  priority: "'essential' if load.essential, else 'perishable' if load.perishable, else 'standard'.",
  notes: [
    "load.plannedHours is the driving time still ahead on the current route; the detour adds to it.",
    "Timestamps are ISO-8601 in Australia/Brisbane (UTC+10, no DST).",
    "event.endsAtIso is informational for the agent's reasoning; the golden decision does not depend on it.",
  ],
};

// ---- Catalogues (Brisbane-based demo fleet) ----
const LOADS = [
  { ref: "LM-1001", originLabel: "Brisbane, QLD", destLabel: "Townsville, QLD", tonnes: 24, valueAud: 180000, perishable: false, essential: false, plannedHours: 15.5 },
  { ref: "LM-1002", originLabel: "Brisbane, QLD", destLabel: "Rockhampton, QLD", tonnes: 18, valueAud: 95000, perishable: true, essential: false, plannedHours: 8.5 },
  { ref: "LM-1003", originLabel: "Toowoomba, QLD", destLabel: "Mount Isa, QLD", tonnes: 22, valueAud: 240000, perishable: false, essential: true, plannedHours: 22 },
  { ref: "LM-1004", originLabel: "Brisbane, QLD", destLabel: "Gold Coast, QLD", tonnes: 12, valueAud: 30000, perishable: false, essential: false, plannedHours: 1.5 },
  { ref: "LM-1005", originLabel: "Brisbane, QLD", destLabel: "Cairns, QLD", tonnes: 20, valueAud: 320000, perishable: true, essential: true, plannedHours: 20 },
  { ref: "LM-1006", originLabel: "Gladstone, QLD", destLabel: "Brisbane, QLD", tonnes: 26, valueAud: 60000, perishable: false, essential: false, plannedHours: 6.5 },
  { ref: "LM-1007", originLabel: "Brisbane, QLD", destLabel: "Mackay, QLD", tonnes: 16, valueAud: 140000, perishable: true, essential: false, plannedHours: 12 },
  { ref: "LM-1008", originLabel: "Brisbane, QLD", destLabel: "Roma, QLD", tonnes: 21, valueAud: 70000, perishable: false, essential: true, plannedHours: 6 },
];

const EVENTS: Array<Omit<CaseInput["event"], "nearestKm">> = [
  { kind: "flood", severity: "major", road: "Bruce Hwy", title: "Water over road at Gympie", radiusKm: 5, endsAtIso: null },
  { kind: "closure", severity: "critical", road: "Bruce Hwy", title: "Bruce Hwy closed at Rockhampton floodplain", radiusKm: 8, endsAtIso: "2026-10-16T18:00:00+10:00" },
  { kind: "crash", severity: "moderate", road: "Warrego Hwy", title: "Multi-vehicle crash near Gatton", radiusKm: 3, endsAtIso: "2026-10-15T12:00:00+10:00" },
  { kind: "restriction", severity: "minor", road: "Pacific Mwy", title: "Lane closure for roadworks at Coomera", radiusKm: 3, endsAtIso: "2026-10-15T15:00:00+10:00" },
  { kind: "fire", severity: "critical", road: "Flinders Hwy", title: "Bushfire crossing Flinders Hwy near Hughenden", radiusKm: 15, endsAtIso: null },
  { kind: "weather", severity: "major", road: "Capricorn Hwy", title: "Severe thunderstorm band, 90 km/h gusts", radiusKm: 20, endsAtIso: "2026-10-15T21:00:00+10:00" },
  { kind: "flood", severity: "moderate", road: "Dawson Hwy", title: "Flash flooding at Biloela", radiusKm: 4, endsAtIso: "2026-10-16T06:00:00+10:00" },
];

const STATUSES: LoadStatus[] = ["planned", "en_route", "delayed", "rerouted"];
/** Nearest-vertex distance as a fraction of the event radius (>1 = outside zone). */
const NEAR_FACTORS = [0.2, 0.9, 1.4, 0.5, 0.7];
/** Detour options in hours; null = no detour available. */
const DETOURS: Array<number | null> = [1.5, null, 4, 0.5, 9, 2.5];
/** Slack between now + plannedHours and dueAt, in hours. */
const SLACKS = [2, 5, 10, 1, 8];

const NOW_MS = Date.parse("2026-10-15T06:00:00+10:00");

function isoBrisbane(ms: number): string {
  const local = new Date(ms + 10 * 3600_000);
  return local.toISOString().replace(/\.\d{3}Z$/, "+10:00");
}

function decide(input: CaseInput): Expected {
  const { load, event, detourHoursIfRerouted: detour } = input;
  const priority: Priority = load.essential ? "essential" : load.perishable ? "perishable" : "standard";
  const notice = (d: Decision) => d !== "proceed";
  const finish = (decision: Decision, reason: string): Expected =>
    ({ decision, reason, customerNoticeRequired: notice(decision), priority });

  if (event.nearestKm > event.radiusKm) {
    return finish("proceed", `Route passes ${event.nearestKm} km from the event, outside its ${event.radiusKm} km zone.`);
  }
  if (event.severity === "minor") {
    return finish("proceed", `Minor ${event.kind} on ${event.road}; expected delay is negligible.`);
  }
  if (event.severity === "critical" && load.status === "en_route") {
    return finish("escalate", `Critical ${event.kind} on ${event.road} with the truck already en route inside the zone; dispatcher must direct the driver.`);
  }
  const dueMs = Date.parse(load.dueAtIso);
  const nowMs = Date.parse(input.nowIso);
  if (detour !== null) {
    const arrival = nowMs + (load.plannedHours + detour) * 3600_000;
    if (arrival <= dueMs) {
      return finish("reroute", `Detour of ${detour} h avoids ${event.road} and still arrives before the due time.`);
    }
    if (load.essential || load.perishable) {
      return finish("escalate", `Only detour (${detour} h) misses the due time and the load is ${priority}; needs a human call.`);
    }
    return finish("hold", `Only detour (${detour} h) misses the due time; hold the standard load until ${event.road} clears.`);
  }
  if (load.essential || load.perishable) {
    return finish("escalate", `No detour exists around ${event.road} and the load is ${priority}; needs a human call.`);
  }
  return finish("hold", `No detour exists around ${event.road}; hold the standard load until the event clears.`);
}

function buildCase(i: number): Case {
  const load = LOADS[i % LOADS.length];
  const ev = EVENTS[Math.floor(i / 3) % EVENTS.length];
  const status = STATUSES[Math.floor(i / 2) % STATUSES.length];
  const factor = NEAR_FACTORS[Math.floor(i / 5) % NEAR_FACTORS.length];
  const detour = DETOURS[Math.floor(i / 4) % DETOURS.length];
  const slack = SLACKS[Math.floor(i / 7) % SLACKS.length];

  const nearestKm = Math.round(ev.radiusKm * factor * 10) / 10;
  const dueAtIso = isoBrisbane(NOW_MS + (load.plannedHours + slack) * 3600_000);

  const input: CaseInput = {
    load: { ref: load.ref, status, originLabel: load.originLabel, destLabel: load.destLabel, dueAtIso,
      tonnes: load.tonnes, valueAud: load.valueAud, perishable: load.perishable, essential: load.essential,
      plannedHours: load.plannedHours },
    event: { ...ev, nearestKm },
    detourHoursIfRerouted: detour,
    nowIso: isoBrisbane(NOW_MS),
  };
  return { id: `disruption-${String(i + 1).padStart(3, "0")}`, input, expected: decide(input) };
}

const cases = Array.from({ length: 50 }, (_, i) => buildCase(i));
const counts: Record<string, number> = {};
for (const c of cases) counts[c.expected.decision] = (counts[c.expected.decision] ?? 0) + 1;

const out = { _rules: RULES, _generatedBy: "evals/generate_disruption_cases.ts", _decisionCounts: counts, cases };
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "disruption_cases.json");
fs.writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${cases.length} cases to ${target}`, counts);
