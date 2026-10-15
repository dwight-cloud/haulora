"use client";

import { useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { api } from "@/lib/ui/format";

/** Reads the phone's position once and sends it to dispatch. Declined or unavailable: a message, nothing else. */
export function ShareLocation({ onShared }: { onShared?: () => void }) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  const go = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ busy: false, msg: "This phone cannot share its location.", ok: false }); return;
    }
    setState({ busy: true, msg: null, ok: false });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api("/api/driver/position", { method: "POST", body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude }) });
          setState({ busy: false, msg: "Dispatch can now see where you are.", ok: true });
          onShared?.();
        } catch (e) { setState({ busy: false, msg: e instanceof Error ? e.message : "Could not send your location.", ok: false }); }
      },
      () => setState({ busy: false, msg: "Location is off for this site. Nothing was sent.", ok: false }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  return (
    <div>
      <button type="button" onClick={go} disabled={state.busy} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-bitumen-200 bg-white px-4 text-[15px] font-semibold text-bitumen-800 shadow-card transition hover:bg-bitumen-50 disabled:opacity-60">
        {state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-rust-500" />}
        Share my location
      </button>
      {state.msg && <div role="status" className={`mt-1.5 text-center text-[12px] ${state.ok ? "text-gum-700" : "text-bitumen-500"}`}>{state.msg}</div>}
    </div>
  );
}
