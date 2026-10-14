import { db } from "./db";
import { randomUUID } from "node:crypto";

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id           TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    from_role    TEXT NOT NULL,
    from_name    TEXT NOT NULL,
    driver_id    TEXT NOT NULL,       -- always the driver side of the thread
    body         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    read_at      INTEGER,
    lat          REAL,
    lon          REAL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(account_id, driver_id, created_at);
`);

// Additive migration for installs that predate the lat/lon columns.
try { db.exec(`ALTER TABLE messages ADD COLUMN lat REAL`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN lon REAL`); } catch {}

export interface Message {
  id: string;
  accountId: string;
  fromUserId: string;
  fromRole: "driver" | "dispatcher";
  fromName: string;
  driverId: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  lat: number | null;
  lon: number | null;
}

interface Row {
  id: string;
  account_id: string;
  from_user_id: string;
  from_role: "driver" | "dispatcher";
  from_name: string;
  driver_id: string;
  body: string;
  created_at: number;
  read_at: number | null;
  lat: number | null;
  lon: number | null;
}

function toMessage(r: Row): Message {
  return {
    id: r.id,
    accountId: r.account_id,
    fromUserId: r.from_user_id,
    fromRole: r.from_role,
    fromName: r.from_name,
    driverId: r.driver_id,
    body: r.body,
    createdAt: r.created_at,
    readAt: r.read_at,
    lat: r.lat,
    lon: r.lon,
  };
}

export function sendMessage(opts: {
  accountId: string;
  fromUserId: string;
  fromRole: "driver" | "dispatcher";
  fromName: string;
  driverId: string;
  body: string;
  lat?: number | null;
  lon?: number | null;
}): Message {
  const id = "m-" + randomUUID();
  const now = Date.now();
  const body = opts.body.trim().slice(0, 2000);
  if (!body && opts.lat == null) throw new Error("empty message");
  const lat = Number.isFinite(opts.lat as number) ? (opts.lat as number) : null;
  const lon = Number.isFinite(opts.lon as number) ? (opts.lon as number) : null;
  db.prepare(
    `INSERT INTO messages (id, account_id, from_user_id, from_role, from_name, driver_id, body, created_at, lat, lon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, opts.accountId, opts.fromUserId, opts.fromRole, opts.fromName, opts.driverId, body, now, lat, lon);
  return {
    id, accountId: opts.accountId, fromUserId: opts.fromUserId, fromRole: opts.fromRole,
    fromName: opts.fromName, driverId: opts.driverId, body, createdAt: now, readAt: null,
    lat, lon,
  };
}

export function listThread(accountId: string, driverId: string, limit = 200): Message[] {
  const rows = db.prepare(
    `SELECT * FROM messages WHERE account_id = ? AND driver_id = ? ORDER BY created_at ASC LIMIT ?`
  ).all(accountId, driverId, limit) as Row[];
  return rows.map(toMessage);
}

export function listThreadsForAccount(accountId: string): Array<{
  driverId: string;
  driverName: string;
  lastBody: string;
  lastAt: number;
  lastFromRole: "driver" | "dispatcher";
  unreadForDispatch: number;
}> {
  const rows = db.prepare(
    `SELECT m.driver_id, u.name AS driver_name,
            (SELECT body FROM messages m2 WHERE m2.account_id = m.account_id AND m2.driver_id = m.driver_id ORDER BY created_at DESC LIMIT 1) AS last_body,
            MAX(m.created_at) AS last_at,
            (SELECT from_role FROM messages m3 WHERE m3.account_id = m.account_id AND m3.driver_id = m.driver_id ORDER BY created_at DESC LIMIT 1) AS last_from_role,
            SUM(CASE WHEN m.from_role='driver' AND m.read_at IS NULL THEN 1 ELSE 0 END) AS unread_for_dispatch
       FROM messages m
       LEFT JOIN users u ON u.id = m.driver_id
      WHERE m.account_id = ?
      GROUP BY m.driver_id
      ORDER BY last_at DESC`
  ).all(accountId) as Array<{
    driver_id: string; driver_name: string | null; last_body: string; last_at: number;
    last_from_role: "driver" | "dispatcher"; unread_for_dispatch: number;
  }>;
  return rows.map((r) => ({
    driverId: r.driver_id,
    driverName: r.driver_name ?? "(unknown driver)",
    lastBody: r.last_body,
    lastAt: r.last_at,
    lastFromRole: r.last_from_role,
    unreadForDispatch: r.unread_for_dispatch ?? 0,
  }));
}

export function markThreadReadFor(accountId: string, driverId: string, role: "driver" | "dispatcher"): void {
  const now = Date.now();
  // A dispatcher reading the thread marks driver-sent messages read; a driver reading marks dispatcher-sent read.
  const otherRole = role === "dispatcher" ? "driver" : "dispatcher";
  db.prepare(
    `UPDATE messages SET read_at = ? WHERE account_id = ? AND driver_id = ? AND from_role = ? AND read_at IS NULL`
  ).run(now, accountId, driverId, otherRole);
}
