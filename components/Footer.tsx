import Link from "next/link";
import { Wordmark } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-xs text-ink-500 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-ink-900">
          <Wordmark />
          <span className="text-ink-400">Proof of concept, {new Date().getFullYear()}</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/#agents" className="hover:text-ink-900">Agents</Link>
          <Link href="/about" className="hover:text-ink-900">How it works</Link>
          <Link href="/login" className="hover:text-ink-900">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
