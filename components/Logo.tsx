import Link from "next/link";

export const BRAND_NAME = "Haulio";
export const BRAND_TAGLINE = "AI dispatcher copilot for Australian road freight";

export function Logo({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 select-none" aria-label={BRAND_NAME}>
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${
          dark ? "bg-white text-ink-900" : "bg-ink-900 text-white"
        }`}
      >
        LM
      </span>
      <span className={`text-base font-semibold tracking-tight ${dark ? "text-white" : "text-ink-900"}`}>
        {BRAND_NAME}
      </span>
    </Link>
  );
}

export default Logo;

/** Inline wordmark (no link) for nav bars and footers. */
export function Wordmark({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${onDark ? "bg-white text-ink-900" : "bg-ink-900 text-white"}`}>H</span>
      <span className={`text-[15px] font-semibold tracking-tight ${onDark ? "text-white" : ""}`}>{BRAND_NAME}</span>
    </span>
  );
}
