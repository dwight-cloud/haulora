"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Skeleton, TruckList, markTruckPicked, useDriver } from "@/components/driver/DriverShell";
import { api } from "@/lib/ui/format";

export function TruckClient() {
  const { me, refresh } = useDriver();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!me) return <Skeleton />;
  const pick = async (id: string) => {
    setBusy(id); setErr(null);
    try {
      await api("/api/driver/me", { method: "POST", body: JSON.stringify({ truckId: id }) });
      markTruckPicked();
      await refresh();
      router.push("/driver");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not switch"); setBusy(null); }
  };
  return (
    <div className="animate-fade-up">
      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-rust-600">Me</div>
      <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-bitumen-900">{me.user.name}</h1>
      <p className="mt-0.5 text-[14px] text-bitumen-500">{me.user.accountName}{me.user.role === "dispatcher" ? " · signed in from the office" : ""}</p>
      <h2 className="mt-5 text-[15px] font-semibold text-bitumen-900">Which truck are you in today?</h2>
      {err && <div role="alert" className="mt-2 text-[13px] text-red-700">{err}</div>}
      <TruckList trucks={me.trucks} currentId={me.truck.id} busyId={busy} onPick={pick} />
    </div>
  );
}
