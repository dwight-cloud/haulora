import Link from "next/link";
import { Wordmark, BRAND_TAGLINE } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-bitumen-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-bitumen-500 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Wordmark size="sm" />
          <span className="text-bitumen-400">{BRAND_TAGLINE} · Proof of concept, {new Date().getFullYear()}</span>
        </div>
        <nav className="flex items-center gap-1" aria-label="Footer">
          <FootLink href="/#agents">Agents</FootLink>
          <FootLink href="/about">How it works</FootLink>
          <FootLink href="/login">Sign in</FootLink>
        </nav>
      </div>
    </footer>
  );
}

function FootLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center rounded-md px-2 hover:text-bitumen-900 md:min-h-0">
      {children}
    </Link>
  );
}
