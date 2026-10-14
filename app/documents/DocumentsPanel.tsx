"use client";

import { useEffect, useState } from "react";

interface DocumentRow {
  id: string; kind: string; title: string;
  expiresAt: number | null; fileMime: string | null; hasFile: boolean; createdAt: number;
}

const KINDS = ["cdl", "medical_card", "insurance", "registration", "permit", "ifta_sticker", "bill_of_lading", "other"];

export function DocumentsPanel() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("cdl");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/documents");
    if (r.ok) setDocs((await r.json()).documents ?? []);
  }
  useEffect(() => { load(); }, []);

  async function upload() {
    if (!title.trim()) return;
    setBusy(true); setErr(null);
    try {
      let fileData: string | null = null;
      let fileMime: string | null = null;
      if (file) {
        fileMime = file.type;
        fileData = await fileToBase64(file);
      }
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title, kind,
          expiresAt: expires ? new Date(expires).getTime() : null,
          fileData, fileMime,
        }),
      });
      if (!res.ok) throw new Error(`upload failed ${res.status}`);
      setTitle(""); setExpires(""); setFile(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "upload error");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await load();
  }

  const now = Date.now();
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-3xl font-black">Document wallet</h1>
      <p className="text-ink-500">CDL, medical card, insurance, permits — expiration tracked automatically.</p>

      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
        <h2 className="font-bold">Add document</h2>
        {err && <div className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Title</span>
            <input className="mt-1 input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CDL TX 2026" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Kind</span>
            <select className="mt-1 input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Expires</span>
            <input type="date" className="mt-1 input" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">File (optional)</span>
            <input type="file" accept="image/*,application/pdf" className="mt-1 text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <button
          disabled={busy || !title.trim()}
          onClick={upload}
          className="mt-4 rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-offwhite hover:bg-ink-800 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Save document"}
        </button>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">On file ({docs.length})</h2>
        <div className="mt-3 space-y-2">
          {docs.length === 0 && <div className="text-sm text-ink-500">Nothing yet. Upload a CDL or medical card to get started.</div>}
          {docs.map((d) => {
            const expSoon = d.expiresAt != null && d.expiresAt - now < 30 * 86400_000;
            const expired = d.expiresAt != null && d.expiresAt < now;
            return (
              <div key={d.id} className="flex items-center justify-between rounded-xl border border-ink-200 bg-white p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-bold truncate">{d.title}</div>
                    <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-500">
                      {d.kind.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-xs text-ink-500">
                    {d.expiresAt
                      ? <>Expires {new Date(d.expiresAt).toLocaleDateString()} {expired ? <b className="text-red-600">· EXPIRED</b> : expSoon ? <b className="text-yellow-600">· Expires soon</b> : null}</>
                      : "No expiration set"}
                    {d.hasFile && <> · <a className="underline" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">view file</a></>}
                  </div>
                </div>
                <button onClick={() => remove(d.id)} className="rounded border border-ink-200 px-3 py-1 text-xs font-bold text-ink-600 hover:text-red-600">Delete</button>
              </div>
            );
          })}
        </div>
      </section>

      <style jsx global>{`
        .input { width: 100%; border: 1px solid rgba(11,30,63,0.2); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
        .input:focus { outline: 2px solid #FF6B1A; outline-offset: -1px; }
      `}</style>
    </main>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
