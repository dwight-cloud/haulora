import { db } from "./db";

export interface DocumentRow {
  id: string;
  userId: string;
  kind: string;
  title: string;
  expiresAt: number | null;
  fileMime: string | null;
  hasFile: boolean;
  createdAt: number;
}

export const DOCUMENT_KINDS = [
  "cdl", "medical_card", "insurance", "registration", "permit", "ifta_sticker", "bill_of_lading", "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function listDocuments(userId: string): DocumentRow[] {
  const rows = db.prepare(
    `SELECT id, user_id AS userId, kind, title, expires_at AS expiresAt,
            file_mime AS fileMime, (file_data IS NOT NULL) AS hasFile, created_at AS createdAt
     FROM documents WHERE user_id = ? ORDER BY
       CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END,
       expires_at ASC, created_at DESC`,
  ).all(userId) as Array<Omit<DocumentRow, "hasFile"> & { hasFile: number }>;
  return rows.map((r) => ({ ...r, hasFile: !!r.hasFile }));
}

export function createDocument(args: {
  userId: string; kind: string; title: string;
  expiresAt: number | null; fileData: string | null; fileMime: string | null;
}): DocumentRow {
  const id = `d-${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO documents (id, user_id, kind, title, expires_at, file_data, file_mime, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, args.userId, args.kind, args.title, args.expiresAt, args.fileData, args.fileMime, Date.now());
  return listDocuments(args.userId).find((d) => d.id === id)!;
}

export function deleteDocument(userId: string, id: string): boolean {
  const r = db.prepare(`DELETE FROM documents WHERE id = ? AND user_id = ?`).run(id, userId);
  return r.changes > 0;
}

export function getDocumentFile(userId: string, id: string): { data: string; mime: string; title: string } | null {
  const row = db.prepare(
    `SELECT file_data AS data, file_mime AS mime, title FROM documents WHERE id = ? AND user_id = ?`,
  ).get(id, userId) as { data: string | null; mime: string | null; title: string } | undefined;
  if (!row?.data) return null;
  return { data: row.data, mime: row.mime ?? "application/octet-stream", title: row.title };
}

/** Documents expiring within `days` (and already-expired). */
export function expiringDocuments(userId: string, days = 30): DocumentRow[] {
  const horizon = Date.now() + days * 86400_000;
  return listDocuments(userId).filter((d) => d.expiresAt != null && d.expiresAt <= horizon);
}
