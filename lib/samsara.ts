// Samsara integration (sandbox mode).
// Real prod flow: customer creates API token at https://cloud.samsara.com,
// pastes it into our Integrations page, we call https://api.samsara.com/fleet/*
// endpoints with `Authorization: Bearer <token>`. In sandbox we accept any
// token, surface mock data, but keep the HTTP shape identical so swapping to
// real calls is a one-line change.

import { db } from "./db";

const SAMSARA_BASE = process.env.SAMSARA_BASE_URL ?? "https://api.samsara.com";
const SAMSARA_SANDBOX = process.env.SAMSARA_SANDBOX !== "0";

export interface SamsaraConnection {
  accountId: string;
  accessToken: string;
  sandbox: boolean;
  orgName: string | null;
  connectedAt: number;
}

export function saveConnection(accountId: string, accessToken: string, orgName?: string): SamsaraConnection {
  const row = {
    accountId,
    accessToken,
    sandbox: SAMSARA_SANDBOX,
    orgName: orgName ?? "Sandbox Fleet",
    connectedAt: Date.now(),
  };
  db.prepare(
    `INSERT INTO samsara_connections (account_id, access_token, sandbox, org_name, connected_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       access_token=excluded.access_token,
       sandbox=excluded.sandbox,
       org_name=excluded.org_name,
       connected_at=excluded.connected_at`,
  ).run(row.accountId, row.accessToken, row.sandbox ? 1 : 0, row.orgName, row.connectedAt);
  return row;
}

export function getConnection(accountId: string): SamsaraConnection | null {
  const r = db.prepare("SELECT * FROM samsara_connections WHERE account_id = ?").get(accountId) as
    | { account_id: string; access_token: string; sandbox: number; org_name: string | null; connected_at: number }
    | undefined;
  if (!r) return null;
  return {
    accountId: r.account_id,
    accessToken: r.access_token,
    sandbox: !!r.sandbox,
    orgName: r.org_name,
    connectedAt: r.connected_at,
  };
}

export function disconnect(accountId: string): boolean {
  const r = db.prepare("DELETE FROM samsara_connections WHERE account_id = ?").run(accountId);
  return r.changes > 0;
}

// Mock fleet snapshot for sandbox. Matches Samsara's /fleet/vehicles/locations shape.
export interface SamsaraVehicleSnapshot {
  id: string;
  name: string;
  driverName: string;
  lat: number;
  lon: number;
  speedMph: number;
  fuelPct: number;
  onDuty: boolean;
  drivingRemainingHours: number;
}

const MOCK: SamsaraVehicleSnapshot[] = [
  { id: "sam-1", name: "Unit 1042", driverName: "R. Alvarez",  lat: 32.7767, lon:  -96.7970, speedMph: 62, fuelPct: 78, onDuty: true,  drivingRemainingHours: 6.5 },
  { id: "sam-2", name: "Unit 1088", driverName: "J. Okafor",   lat: 34.0522, lon: -118.2437, speedMph: 55, fuelPct: 42, onDuty: true,  drivingRemainingHours: 3.0 },
  { id: "sam-3", name: "Unit 1133", driverName: "M. Singh",    lat: 41.8781, lon:  -87.6298, speedMph:  0, fuelPct: 88, onDuty: false, drivingRemainingHours: 10.0 },
];

export async function fetchVehicles(conn: SamsaraConnection): Promise<SamsaraVehicleSnapshot[]> {
  if (conn.sandbox) {
    // Light jitter so the UI feels alive
    return MOCK.map((v) => ({
      ...v,
      speedMph: v.onDuty ? Math.max(0, v.speedMph + Math.round((Math.random() - 0.5) * 6)) : 0,
      fuelPct: Math.max(0, v.fuelPct - Math.round(Math.random() * 2)),
    }));
  }
  // Real prod path — not executed in sandbox but kept so integration is real-looking.
  const res = await fetch(`${SAMSARA_BASE}/fleet/vehicles/locations`, {
    headers: { Authorization: `Bearer ${conn.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Samsara error ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map((v: unknown) => {
    const r = v as { id: string; name: string; location?: { latitude: number; longitude: number; speedMilesPerHour?: number } };
    return {
      id: r.id,
      name: r.name,
      driverName: "—",
      lat: r.location?.latitude ?? 0,
      lon: r.location?.longitude ?? 0,
      speedMph: r.location?.speedMilesPerHour ?? 0,
      fuelPct: 0,
      onDuty: (r.location?.speedMilesPerHour ?? 0) > 1,
      drivingRemainingHours: 0,
    };
  });
}
