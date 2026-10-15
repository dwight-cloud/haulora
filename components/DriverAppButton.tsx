"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Smartphone } from "lucide-react";

/**
 * "Open the driver app". A signed-in dispatcher goes to the phone-frame
 * preview (same cookie, no sign-out). A signed-out visitor is signed in as
 * the demo driver first, then lands on /driver itself.
 */
export function DriverAppButton({ signedIn, className = "", label = "See the driver app" }: { signedIn: boolean; className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (signedIn) { router.push("/driver-preview"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/demo-driver", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Sign-in failed (${res.status})`);
      router.push("/driver");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={go} disabled={busy} className={className}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
        {busy ? "Signing in…" : label}
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
