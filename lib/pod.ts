import { db } from "./db";

export interface PodCapture {
  id: string;
  userId: string;
  routeLabel: string | null;
  signerName: string | null;
  signerSignature: string | null;
  photoData: string | null;
  notes: string | null;
  createdAt: number;
}

export interface PodSummary extends Omit<PodCapture, "signerSignature" | "photoData"> {
  hasPhoto: boolean;
  hasSignature: boolean;
}

export function createPod(args: Omit<PodCapture, "id" | "createdAt">): PodCapture {
  const id = `pod-${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO pod_captures (id, user_id, route_label, signer_name, signer_signature, photo_data, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, args.userId, args.routeLabel, args.signerName, args.signerSignature,
        args.photoData, args.notes, Date.now());
  return { ...args, id, createdAt: Date.now() };
}

export function listPodsSummary(userId: string, limit = 50): PodSummary[] {
  const rows = db.prepare(
    `SELECT id, user_id AS userId, route_label AS routeLabel, signer_name AS signerName,
            notes, created_at AS createdAt,
            (photo_data IS NOT NULL) AS hasPhoto,
            (signer_signature IS NOT NULL) AS hasSignature
     FROM pod_captures WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).all(userId, limit) as Array<Omit<PodSummary, "hasPhoto" | "hasSignature"> & { hasPhoto: number; hasSignature: number }>;
  return rows.map((r) => ({ ...r, hasPhoto: !!r.hasPhoto, hasSignature: !!r.hasSignature }));
}

export function getPod(userId: string, id: string): PodCapture | null {
  const row = db.prepare(
    `SELECT id, user_id AS userId, route_label AS routeLabel, signer_name AS signerName,
            signer_signature AS signerSignature, photo_data AS photoData, notes, created_at AS createdAt
     FROM pod_captures WHERE id = ? AND user_id = ?`,
  ).get(id, userId) as PodCapture | undefined;
  return row ?? null;
}
