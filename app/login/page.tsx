"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Wordmark, Mark, BRAND_TAGLINE } from "@/components/Logo";
import { DemoButton } from "@/components/DemoButton";

type Mode = "login" | "create" | "invite";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompany] = useState("");
  const [inviteCode, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      let res: Response;
      if (mode === "login") {
        res = await fetch("/api/auth/login", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } else {
        const body: Record<string, unknown> = { email, password, name, mode };
        if (mode === "create") body.companyName = companyName;
        if (mode === "invite") body.inviteCode = inviteCode;
        res = await fetch("/api/auth/signup", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const dest = next || (data.user.role === "driver" ? "/driver" : "/dashboard");
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Left: brand panel */}
      <aside className="relative hidden overflow-hidden bg-bitumen-900 text-white lg:block">
        <div className="absolute inset-0 bg-hero-glow" aria-hidden />
        <div
          className="absolute inset-0 bg-grid-dark [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]"
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="inline-flex rounded-md" aria-label="Haulora home"><Wordmark onDark /></Link>

          <div className="max-w-md">
            <Mark size={64} onDark />
            <h2 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight">
              {BRAND_TAGLINE}.
            </h2>
            <p className="mt-5 text-white/70">
              Three AI helpers watch the things that go wrong in trucking: diesel prices, road closures and drivers calling in sick. They work out the next move and put it in front of you to say yes or no.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-white/80">
              {[
                "Real truck routes and live weather",
                "Every suggestion costed in A$ before you decide",
                "Nothing changes until you accept it",
                "You can see every step the AI took",
              ].map((x) => (
                <li key={x} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rust-500 text-white">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-white/50">© {new Date().getFullYear()} Haulora · Proof of concept</div>
        </div>
      </aside>

      {/* Right: form */}
      <section className="flex items-center justify-center px-4 py-12 md:px-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden"><Link href="/" className="inline-flex rounded-md" aria-label="Haulora home"><Wordmark /></Link><div className="mt-1 text-sm text-bitumen-500">{BRAND_TAGLINE}</div></div>

          {/* Demo first */}
          <div className="mt-8 rounded-xl border border-rust-200 bg-rust-50/60 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rust-700">Fastest way in</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-bitumen-900">Open the live demo</h1>
            <p className="mt-1 text-sm leading-6 text-bitumen-600">One click signs you in as the person running a made-up Brisbane fleet. No account needed.</p>
            <div className="mt-4"><DemoButton /></div>
          </div>

          <div className="mt-8 flex items-center gap-3 text-xs text-bitumen-400"><span className="h-px flex-1 bg-bitumen-200" />or sign in with an account<span className="h-px flex-1 bg-bitumen-200" /></div>

          <div role="tablist" className="mt-6 inline-flex rounded-xl border border-bitumen-200 bg-white p-1 text-sm font-semibold shadow-sm">
            {(["login","create","invite"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-[40px] rounded-lg px-4 transition ${mode === m ? "bg-bitumen-900 text-white shadow-sm" : "text-bitumen-500 hover:text-bitumen-900"}`}
              >
                {m === "login" ? "Sign in" : m === "create" ? "New fleet" : "Join fleet"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "create" && (
              <Field label="Fleet or company name">
                <input className="input" value={companyName} onChange={(e) => setCompany(e.target.value)} required />
              </Field>
            )}
            {mode === "invite" && (
              <Field label="Invite code">
                <input
                  className="input font-mono tracking-[0.15em]"
                  value={inviteCode}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                  required
                />
              </Field>
            )}
            {mode !== "login" && (
              <Field label="Your full name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
            )}
            <Field label="Email">
              <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Password">
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required
                     autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 8} />
            </Field>
            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <button
              disabled={loading}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-bitumen-900 font-semibold text-white shadow-sm transition hover:bg-bitumen-800 disabled:opacity-50"
            >
              {loading ? "…" : mode === "login" ? "Sign in" : mode === "create" ? "Create fleet account" : "Join fleet"}
            </button>
          </form>

          {mode === "login" && (
            <p className="mt-6 text-xs leading-5 text-bitumen-400">
              Demo sign-ins, if you need them: fleet manager <button type="button" className="font-mono text-bitumen-600 underline-offset-2 hover:underline" onClick={() => { setEmail("dispatch@demo.local"); setPassword("dispatch123"); }}>dispatch@demo.local / dispatch123</button>,
              driver <button type="button" className="font-mono text-bitumen-600 underline-offset-2 hover:underline" onClick={() => { setEmail("driver@demo.local"); setPassword("driver123"); }}>driver@demo.local / driver123</button>.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-widest text-bitumen-500">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
