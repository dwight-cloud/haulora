// FMCSA 49 CFR Part 395 — property-carrying driver HOS limits
// 11-hour driving limit per duty period
// 14-hour on-duty window per duty period
// 70-hour / 8-day on-duty cycle (US 7-day is 60h; we default to 70/8)
// 30-min break required after 8 cumulative driving hours
// 10-hour off-duty break resets the 11/14 clocks

import { db } from "./db";

export type HosStatus = "driving" | "on_duty" | "sleeper" | "off_duty";

export interface HosEvent {
  id: string;
  userId: string;
  status: HosStatus;
  lat?: number | null;
  lon?: number | null;
  timestamp: number;
  source: string;
}

export interface HosState {
  current: HosStatus;
  sinceMs: number;                 // how long in current status
  drivingRemainingHours: number;   // of 11h
  windowRemainingHours: number;    // of 14h
  cycleRemainingHours: number;     // of 70h in last 8 days
  breakDueHours: number | null;    // mins until 30-min break required (null if not driving)
  lastReset: number | null;        // timestamp of last 10h+ off_duty/sleeper reset
}

export function logHosEvent(args: {
  userId: string;
  status: HosStatus;
  lat?: number | null;
  lon?: number | null;
  source?: string;
  timestamp?: number;
}): HosEvent {
  const id = `hos-${crypto.randomUUID()}`;
  const ts = args.timestamp ?? Date.now();
  db.prepare(
    `INSERT INTO hos_events (id, user_id, status, lat, lon, timestamp, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, args.userId, args.status, args.lat ?? null, args.lon ?? null, ts, args.source ?? "manual");
  return {
    id, userId: args.userId, status: args.status,
    lat: args.lat ?? null, lon: args.lon ?? null,
    timestamp: ts, source: args.source ?? "manual",
  };
}

export function listHosEvents(userId: string, sinceMs?: number): HosEvent[] {
  const rows = db.prepare(
    `SELECT * FROM hos_events WHERE user_id = ? AND timestamp >= ? ORDER BY timestamp ASC`,
  ).all(userId, sinceMs ?? 0) as Array<{
    id: string; user_id: string; status: HosStatus;
    lat: number | null; lon: number | null; timestamp: number; source: string;
  }>;
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, status: r.status,
    lat: r.lat, lon: r.lon, timestamp: r.timestamp, source: r.source,
  }));
}

export function computeHosState(userId: string, now: number = Date.now()): HosState {
  // Pull last 9 days of events
  const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
  const since = now - 9 * 24 * 60 * 60 * 1000;
  const events = listHosEvents(userId, since);

  if (events.length === 0) {
    return {
      current: "off_duty",
      sinceMs: 0,
      drivingRemainingHours: 11,
      windowRemainingHours: 14,
      cycleRemainingHours: 70,
      breakDueHours: null,
      lastReset: null,
    };
  }

  // Walk events and build per-status durations since last 10h off reset
  const terminal: HosStatus = events[events.length - 1].status;
  const sinceStatus = now - events[events.length - 1].timestamp;

  // Find last 10h+ off_duty or sleeper segment that completed before `now`
  let lastReset: number | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const next = events[i + 1]?.timestamp ?? now;
    if ((e.status === "off_duty" || e.status === "sleeper") && next - e.timestamp >= 10 * 3600_000) {
      lastReset = next;
      break;
    }
  }

  // Driving time since lastReset (toward 11h limit)
  // On-duty window start = first on_duty/driving after lastReset (toward 14h limit)
  let drivingMs = 0;
  let windowStart: number | null = null;
  let drivingSinceLastBreak = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const end = events[i + 1]?.timestamp ?? now;
    if (lastReset && e.timestamp < lastReset) continue; // before this reset

    const dur = Math.max(0, end - Math.max(e.timestamp, lastReset ?? 0));
    if (e.status === "driving") {
      drivingMs += dur;
      drivingSinceLastBreak += dur;
      if (windowStart === null) windowStart = e.timestamp;
    } else if (e.status === "on_duty") {
      if (windowStart === null) windowStart = e.timestamp;
    } else {
      // off_duty or sleeper of ≥30min resets the break counter
      if (dur >= 30 * 60_000) drivingSinceLastBreak = 0;
    }
  }

  const windowMs = windowStart != null ? now - windowStart : 0;

  // 70h/8day cycle: sum driving + on_duty in last 8 days
  let cycleMs = 0;
  const cycleSince = now - eightDaysMs;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const end = events[i + 1]?.timestamp ?? now;
    if (end < cycleSince) continue;
    const start = Math.max(e.timestamp, cycleSince);
    const dur = end - start;
    if (e.status === "driving" || e.status === "on_duty") cycleMs += dur;
  }

  const H = 3600_000;
  return {
    current: terminal,
    sinceMs: sinceStatus,
    drivingRemainingHours: Math.max(0, 11 - drivingMs / H),
    windowRemainingHours:  Math.max(0, 14 - windowMs / H),
    cycleRemainingHours:   Math.max(0, 70 - cycleMs / H),
    breakDueHours:         terminal === "driving" ? Math.max(0, 8 - drivingSinceLastBreak / H) : null,
    lastReset,
  };
}
