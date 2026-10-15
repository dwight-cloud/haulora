import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "haulora.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('dispatcher','driver')),
    name          TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);

  CREATE TABLE IF NOT EXISTS invites (
    code       TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('dispatcher','driver')),
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_by    TEXT REFERENCES users(id),
    used_at    INTEGER
  );

`);

export interface AccountRow { id: string; name: string; created_at: number }
export interface UserRow {
  id: string; account_id: string; email: string; password_hash: string;
  role: "dispatcher" | "driver"; name: string; created_at: number;
}
export interface InviteRow {
  code: string; account_id: string; role: "dispatcher" | "driver";
  created_by: string; created_at: number; expires_at: number;
  used_by: string | null; used_at: number | null;
}

function genId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function genInviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 10; i++) s += chars[bytes[i] % chars.length];
  return `${s.slice(0,5)}-${s.slice(5)}`;
}

export function createAccount(name: string): AccountRow {
  const id = genId("a");
  db.prepare("INSERT INTO accounts (id, name, created_at) VALUES (?, ?, ?)").run(id, name, Date.now());
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow;
}

export function findAccountById(id: string): AccountRow | undefined {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(args: {
  accountId: string; email: string; password: string;
  role: "dispatcher" | "driver"; name: string;
}): UserRow {
  const id = genId("u");
  const hash = bcrypt.hashSync(args.password, 10);
  db.prepare(
    `INSERT INTO users (id, account_id, email, password_hash, role, name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, args.accountId, args.email.toLowerCase(), hash, args.role, args.name, Date.now());
  return findUserById(id)!;
}

export function listDriversForAccount(accountId: string): UserRow[] {
  return db.prepare(
    "SELECT * FROM users WHERE account_id = ? AND role = 'driver' ORDER BY created_at DESC",
  ).all(accountId) as UserRow[];
}

export function listDispatchersForAccount(accountId: string): UserRow[] {
  return db.prepare(
    "SELECT * FROM users WHERE account_id = ? AND role = 'dispatcher' ORDER BY created_at DESC",
  ).all(accountId) as UserRow[];
}

export function createInvite(args: {
  accountId: string; role: "dispatcher" | "driver";
  createdBy: string; ttlMinutes?: number;
}): InviteRow {
  const code = genInviteCode();
  const now = Date.now();
  const expires = now + (args.ttlMinutes ?? 60 * 24 * 7) * 60_000;
  db.prepare(
    `INSERT INTO invites (code, account_id, role, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(code, args.accountId, args.role, args.createdBy, now, expires);
  return db.prepare("SELECT * FROM invites WHERE code = ?").get(code) as InviteRow;
}

export function findInvite(code: string): InviteRow | undefined {
  return db.prepare("SELECT * FROM invites WHERE code = ?").get(code.toUpperCase()) as InviteRow | undefined;
}

export function consumeInvite(code: string, userId: string): boolean {
  const r = db.prepare(
    "UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL AND expires_at > ?",
  ).run(userId, Date.now(), code.toUpperCase(), Date.now());
  return r.changes > 0;
}

export function listInvitesForAccount(accountId: string): InviteRow[] {
  return db.prepare(
    "SELECT * FROM invites WHERE account_id = ? ORDER BY created_at DESC LIMIT 50",
  ).all(accountId) as InviteRow[];
}

export function revokeInvite(code: string, accountId: string): boolean {
  const r = db.prepare(
    "DELETE FROM invites WHERE code = ? AND account_id = ? AND used_by IS NULL",
  ).run(code.toUpperCase(), accountId);
  return r.changes > 0;
}

// ---- Seed a demo account on first boot ----
function seed() {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number }).n;
  if (count > 0) return;
  const acc = createAccount("Brisbane Demo Fleet");
  createUser({ accountId: acc.id, email: "dispatch@demo.local", password: "dispatch123", role: "dispatcher", name: "Ops Dispatcher" });
  createUser({ accountId: acc.id, email: "driver@demo.local",   password: "driver123",   role: "driver",     name: "J. Nguyen" });
}
seed();
