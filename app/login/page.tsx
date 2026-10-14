"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "@/components/Logo";

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
      <aside className="relative hidden overflow-hidden bg-ink-900 text-offwhite lg:block">
        <div className="absolute inset-0 bg-hero-glow" aria-hidden />
        <div
          className="absolute inset-0 bg-grid-navy [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]"
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="text-offwhite"><Wordmark onDark /></Link>

          <div className="max-w-md">
            <h2 className="text-4xl font-black leading-tight tracking-tight">
              Truck-smart routes.<br />
              <span className="bg-gradient-to-r from-signal-300 via-signal to-signal-600 bg-clip-text text-transparent">
                Fleet-wide control.
              </span>
            </h2>
            <p className="mt-5 text-offwhite/70">
              Everything dispatch actually uses, in one place. Bring your team — assign roles, set lanes, start routing in minutes.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-offwhite/80">
              {[
                "DOT-legal truck profiles",
                "Multi-account, multi-dispatcher",
                "iOS driver app with turn-by-turn",
                "Works with your existing ELD",
              ].map((x) => (
                <li key={x} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-900/20 text-white-300">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-offwhite/50">
            © {new Date().getFullYear()} Overdrive Nav · <Link href="/privacy" className="hover:text-ink-900">Privacy</Link> · <Link href="/terms" className="hover:text-ink-900">Terms</Link>
          </div>
        </div>
      </aside>

      {/* Right: form */}
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="lg:hidden"><Link href="/" className="text-ink-900"><Wordmark /></Link></div>

          <div className="mt-8 inline-flex rounded-xl border border-ink-200 bg-white p-1 text-sm font-semibold shadow-sm">
            {(["login","create","invite"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-4 py-2 transition ${mode === m ? "bg-ink-900 text-offwhite shadow-sm" : "text-ink-500 hover:text-ink-900"}`}
              >
                {m === "login" ? "Sign in" : m === "create" ? "New fleet" : "Join fleet"}
              </button>
            ))}
          </div>

          <h1 className="mt-8 text-3xl font-black tracking-tight">
            {mode === "login" && "Welcome back"}
            {mode === "create" && "Start a new fleet"}
            {mode === "invite" && "Join your fleet"}
          </h1>
          <p className="mt-1 text-ink-500">
            {mode === "login" && "Dispatchers and drivers sign in here."}
            {mode === "create" && "You'll become the dispatcher and can invite drivers."}
            {mode === "invite" && "Enter the invite code your dispatcher sent you."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "create" && (
              <Field label="Fleet / company name">
                <input className="input" value={companyName} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Trucking" required />
              </Field>
            )}
            {mode === "invite" && (
              <Field label="Invite code">
                <input
                  className="input font-mono tracking-[0.15em]"
                  value={inviteCode}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                  placeholder="ABCDE-12345"
                  required
                />
              </Field>
            )}
            {mode !== "login" && (
              <Field label="Your full name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Dispatcher" required />
              </Field>
            )}
            <Field label="Email">
              <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
            </Field>
            <Field label="Password">
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "login" ? "" : "at least 8 characters"} required
                     autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 8} />
            </Field>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-3 font-bold text-offwhite shadow-sm transition hover:bg-ink-800 disabled:opacity-50"
            >
              {loading ? "…" : (
                <>
                  {mode === "login" ? "Sign in" : mode === "create" ? "Create fleet account" : "Join fleet"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="transition group-hover:translate-x-0.5"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </>
              )}
            </button>
          </form>

          {mode === "login" && (
            <div className="mt-8 rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-900">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-900" /> Demo accounts
              </div>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <button onClick={() => { setEmail("dispatch@overdrive.app"); setPassword("dispatch123"); }}
                        className="flex items-center justify-between rounded-lg bg-ink-50/60 px-3 py-2 text-left font-mono text-xs hover:bg-ink-100">
                  <span>dispatch@overdrive.app · dispatch123</span>
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest text-ink-500">Dispatcher</span>
                </button>
                <button onClick={() => { setEmail("driver@overdrive.app"); setPassword("driver123"); }}
                        className="flex items-center justify-between rounded-lg bg-ink-50/60 px-3 py-2 text-left font-mono text-xs hover:bg-ink-100">
                  <span>driver@overdrive.app · driver123</span>
                  <span className="rounded bg-ink-900/15 px-1.5 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest text-white-700">Driver</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid rgba(11,30,63,0.15);
          border-radius: 0.625rem;
          padding: 0.625rem 0.875rem;
          background: white;
          color: #0B1E3F;
          font-size: 0.95rem;
          transition: border-color .15s, box-shadow .15s;
        }
        .input::placeholder { color: rgba(11,30,63,0.35); }
        .input:focus {
          outline: none;
          border-color: #FF6B1A;
          box-shadow: 0 0 0 3px rgba(255,107,26,0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
