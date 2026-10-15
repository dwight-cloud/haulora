"use client";

import { useState } from "react";
import { ExternalLink, Smartphone } from "lucide-react";

const PHONE_URL = "http://13.229.87.89/driver";
const W = 390, H = 844;

export function PreviewClient() {
  const [showUrl, setShowUrl] = useState(false);
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center lg:gap-16">
      {/* Phone bezel */}
      <div className="shrink-0" style={{ width: W + 28 }}>
        <div className="relative rounded-[58px] bg-[#0b0a09] p-[14px] shadow-[0_30px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08),inset_0_0_0_2px_#2a2724]">
          <div className="absolute -left-[3px] top-[140px] h-9 w-[3px] rounded-l bg-[#2a2724]" aria-hidden />
          <div className="absolute -left-[3px] top-[200px] h-16 w-[3px] rounded-l bg-[#2a2724]" aria-hidden />
          <div className="absolute -right-[3px] top-[180px] h-20 w-[3px] rounded-r bg-[#2a2724]" aria-hidden />
          <div className="relative overflow-hidden rounded-[44px] bg-black" style={{ width: W, height: H }}>
            <div className="pointer-events-none absolute left-1/2 top-[12px] z-10 h-[32px] w-[118px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
            <iframe src="/driver" title="Haulora driver app" width={W} height={H} className="block border-0 bg-canvas" style={{ width: W, height: H }} />
          </div>
        </div>
      </div>

      {/* Explainer */}
      <div className="max-w-md text-white lg:pt-16">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rust-300">Driver app</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">This is the driver's phone.</h1>
        <p className="mt-3 text-[15px] leading-7 text-white/70">
          Press <span className="font-semibold text-white">Report</span> to send a road problem and watch the office side react on
          <span className="font-semibold text-white"> Overview</span> and <span className="font-semibold text-white">Your decisions</span>.
        </p>
        <p className="mt-2 text-[13px] leading-6 text-white/50">
          Same system, same data: the driver's report becomes a road problem, the road AI helper checks every job on that road, and the dispatcher accepts or declines.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a href="/driver" target="_blank" rel="noopener" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-rust-500 px-5 text-[15px] font-semibold text-white hover:bg-rust-600">
            <ExternalLink className="h-4 w-4" /> Open full screen
          </a>
          <button type="button" onClick={() => setShowUrl((v) => !v)} aria-expanded={showUrl} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-5 text-[15px] font-semibold text-white hover:bg-white/10">
            <Smartphone className="h-4 w-4" /> Open on your phone
          </button>
        </div>
        {showUrl && (
          <div className="mt-5 rounded-xl border border-white/15 bg-white/5 p-5">
            <div className="text-[12px] text-white/60">Type this into your phone's browser:</div>
            <div className="mt-2 break-all font-mono text-2xl font-bold tracking-tight text-white md:text-3xl">{PHONE_URL}</div>
            <div className="mt-2 text-[12px] text-white/50">If it asks you to sign in, use driver@demo.local / driver123. Add it to your home screen for the full-screen app.</div>
          </div>
        )}
      </div>
    </div>
  );
}
