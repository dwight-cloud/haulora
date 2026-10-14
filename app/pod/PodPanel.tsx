"use client";

import { useEffect, useRef, useState } from "react";

interface PodSummary {
  id: string; routeLabel: string | null; signerName: string | null;
  notes: string | null; createdAt: number; hasPhoto: boolean; hasSignature: boolean;
}

export function PodPanel() {
  const [pods, setPods] = useState<PodSummary[]>([]);
  const [routeLabel, setRouteLabel] = useState("");
  const [signerName, setSignerName] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sigRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  async function load() {
    const r = await fetch("/api/pod");
    if (r.ok) setPods((await r.json()).pods ?? []);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const c = sigRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#0B1E3F";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const getPos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
    };
    const down = (e: PointerEvent) => { drawing.current = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { drawing.current = false; };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  function clearSig() {
    const c = sigRef.current; if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(f);
  }

  async function submit() {
    setBusy(true);
    try {
      const c = sigRef.current;
      const sig = c ? c.toDataURL("image/png") : null;
      await fetch("/api/pod", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          routeLabel: routeLabel || null,
          signerName: signerName || null,
          signerSignature: sig,
          photoData: photo,
          notes: notes || null,
        }),
      });
      setRouteLabel(""); setSignerName(""); setNotes(""); setPhoto(null);
      clearSig();
      await load();
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-3xl font-black">Proof of delivery</h1>
      <p className="text-ink-500">Capture a photo + consignee signature at drop-off.</p>

      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Route / load</span>
            <input className="mt-1 input" value={routeLabel} onChange={(e) => setRouteLabel(e.target.value)} placeholder="Load #23981" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Signer name</span>
            <input className="mt-1 input" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Consignee name" />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Signature</span>
          <canvas
            ref={sigRef}
            width={800}
            height={220}
            className="mt-1 w-full rounded-lg border border-ink-300 bg-ink-50 touch-none"
          />
          <button onClick={clearSig} type="button" className="mt-1 text-xs text-ink-500 underline">Clear</button>
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Photo (BOL / receipt)</span>
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="mt-1 text-sm" />
          {photo && <img alt="preview" src={photo} className="mt-2 h-32 w-32 rounded-lg object-cover" />}
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Notes</span>
          <textarea className="mt-1 input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <button
          onClick={submit}
          disabled={busy}
          className="mt-4 rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save proof of delivery"}
        </button>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">Recent deliveries ({pods.length})</h2>
        <div className="mt-3 space-y-2">
          {pods.map((p) => (
            <div key={p.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold">{p.routeLabel ?? "Unlabeled"}</div>
                  <div className="text-xs text-ink-500">
                    Signed by {p.signerName ?? "—"} · {new Date(p.createdAt).toLocaleString()}
                  </div>
                  {p.notes && <div className="mt-1 text-sm text-ink-600">{p.notes}</div>}
                </div>
                <div className="flex gap-1">
                  {p.hasSignature && <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] font-bold">SIG</span>}
                  {p.hasPhoto && <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] font-bold">PHOTO</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <style jsx global>{`
        .input { width: 100%; border: 1px solid rgba(11,30,63,0.2); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
        .input:focus { outline: 2px solid #FF6B1A; outline-offset: -1px; }
      `}</style>
    </main>
  );
}
