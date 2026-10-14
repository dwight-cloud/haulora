import { db } from "./db";

db.exec(`
  CREATE TABLE IF NOT EXISTS scorecard_events (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN (
      'hard_brake','rapid_accel','hard_turn','speeding','idle','night_driving'
    )),
    severity   INTEGER NOT NULL DEFAULT 1,
    lat        REAL,
    lon        REAL,
    payload    TEXT,
    timestamp  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_score_user_time ON scorecard_events(user_id, timestamp);
`);

export const EVENT_KINDS = ["hard_brake", "rapid_accel", "hard_turn", "speeding", "idle", "night_driving"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

const PENALTY: Record<EventKind, number> = {
  hard_brake: 4,
  rapid_accel: 3,
  hard_turn: 2,
  speeding: 5,
  idle: 1,
  night_driving: 1,
};

export interface ScoreEvent {
  id: string;
  userId: string;
  kind: EventKind;
  severity: number;
  lat: number | null;
  lon: number | null;
  payload: string | null;
  timestamp: number;
}

export function logScoreEvent(args: {
  userId: string; kind: EventKind; severity?: number;
  lat?: number | null; lon?: number | null; payload?: unknown;
  timestamp?: number;
}): ScoreEvent {
  const id = `se-${crypto.randomUUID()}`;
  const ts = args.timestamp ?? Date.now();
  const payload = args.payload == null ? null : JSON.stringify(args.payload);
  db.prepare(
    `INSERT INTO scorecard_events (id, user_id, kind, severity, lat, lon, payload, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, args.userId, args.kind, args.severity ?? 1, args.lat ?? null, args.lon ?? null, payload, ts);
  return {
    id, userId: args.userId, kind: args.kind, severity: args.severity ?? 1,
    lat: args.lat ?? null, lon: args.lon ?? null, payload, timestamp: ts,
  };
}

export interface ScorecardSummary {
  score: number;                          // 0..100
  letter: "A" | "B" | "C" | "D" | "F";
  events: number;
  byKind: Array<{ kind: EventKind; count: number; penalty: number }>;
  recent: ScoreEvent[];
}

export function summarize(userId: string, sinceMs: number): ScorecardSummary {
  const rows = db.prepare(
    `SELECT id, user_id AS userId, kind, severity, lat, lon, payload, timestamp
     FROM scorecard_events WHERE user_id = ? AND timestamp >= ? ORDER BY timestamp DESC`,
  ).all(userId, sinceMs) as ScoreEvent[];

  const byKindMap = new Map<EventKind, { count: number; penalty: number }>();
  let totalPenalty = 0;
  for (const r of rows) {
    const p = (PENALTY[r.kind] ?? 1) * Math.max(1, r.severity);
    totalPenalty += p;
    const cur = byKindMap.get(r.kind) ?? { count: 0, penalty: 0 };
    cur.count += 1; cur.penalty += p;
    byKindMap.set(r.kind, cur);
  }
  const score = Math.max(0, 100 - totalPenalty);
  const letter: ScorecardSummary["letter"] =
    score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  return {
    score,
    letter,
    events: rows.length,
    byKind: [...byKindMap.entries()]
      .map(([kind, v]) => ({ kind, count: v.count, penalty: v.penalty }))
      .sort((a, b) => b.penalty - a.penalty),
    recent: rows.slice(0, 25),
  };
}
