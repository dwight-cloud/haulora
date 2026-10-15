"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

/** Signs in as the seeded dispatcher (POST /api/auth/demo) and opens the dashboard. */
export function DemoButton({ size = "lg", label = "Open the live demo" }: { size?: "lg" | "md"; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Demo sign-in failed (${res.status})`);
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo sign-in failed");
      setBusy(false);
    }
  }

  const pad = size === "lg" ? "h-12 px-6 text-[15px]" : "h-9 px-4 text-sm";
  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={`inline-flex items-center gap-2 rounded-lg bg-ink-900 font-semibold text-white shadow-card-lg transition hover:bg-ink-800 disabled:opacity-60 ${pad}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Signing in…" : label}
        {!busy && <ArrowRight className="h-4 w-4" />}
      </button>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
