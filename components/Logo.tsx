import Link from "next/link";

export const BRAND_NAME = "Haulora";
export const BRAND_TAGLINE = "AI dispatch for trucking";

/**
 * The Haulora mark: an "H" drawn as two road lanes with a route chevron for
 * the crossbar. Inline SVG, no external image. `onDark` flips the lane
 * colour so the mark sits on the bitumen-dark surfaces as well as white.
 */
export function Mark({ size = 28, onDark = false, className = "" }: { size?: number; onDark?: boolean; className?: string }) {
  const lane = "#B4471C";
  const chevron = onDark ? "#F7F4EE" : "#1C1A17";
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false"
      className={`shrink-0 ${className}`}
    >
      <rect width="32" height="32" rx="7" fill={onDark ? "rgba(255,255,255,0.08)" : "#1C1A17"} />
      <path d="M8 7v18M24 7v18" stroke={lane} strokeWidth="4" strokeLinecap="round" />
      <path d="M8 16l8-4 8 4" fill="none" stroke={onDark ? chevron : "#F7F4EE"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 22l8-4 8 4" fill="none" stroke={lane} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
    </svg>
  );
}

/** Mark + "Haulora" in a confident weight. No link; wrap it yourself. */
export function Wordmark({
  className = "", onDark = false, size = "md",
}: { className?: string; onDark?: boolean; size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? 40 : size === "sm" ? 24 : 28;
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-[15px]" : "text-lg";
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <Mark size={px} onDark={onDark} />
      <span className={`${text} font-extrabold tracking-tight ${onDark ? "text-white" : "text-bitumen-900"}`}>
        {BRAND_NAME}
      </span>
    </span>
  );
}

/** Linked wordmark for nav bars. */
export function Logo({ dark = false, href = "/", size = "md" }: { dark?: boolean; href?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <Link href={href} aria-label={`${BRAND_NAME} home`} className="inline-flex rounded-md">
      <Wordmark onDark={dark} size={size} />
    </Link>
  );
}

export default Logo;
