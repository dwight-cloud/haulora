import Image from "next/image";

export const BRAND_NAME = "Clear Path Overdrive Nav";
export const BRAND_TAGLINE = "Powered by Gorilla Safety";

const LOGO_SRC = "/brand/logo.png";
const LOGO_W = 720;
const LOGO_H = 262;

export function Logo({
  height = 32,
  className = "",
  onDark = false,
}: {
  height?: number;
  className?: string;
  onDark?: boolean;
}) {
  const w = Math.round(height * (LOGO_W / LOGO_H));
  const img = (
    <Image
      src={LOGO_SRC}
      alt={BRAND_NAME}
      width={w}
      height={height}
      priority
      className={onDark ? "" : className}
    />
  );
  // The Gorilla Safety wordmark is dark-ink on transparent. On dark surfaces
  // it disappears, so wrap it in a white pill with a little padding.
  if (onDark) {
    return (
      <span
        className={`inline-flex items-center rounded-lg bg-white px-3 py-1.5 shadow-sm ${className}`}
      >
        {img}
      </span>
    );
  }
  return img;
}

export function Wordmark({
  className = "",
  height = 36,
  onDark = false,
}: {
  className?: string;
  height?: number;
  onDark?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Logo height={height} onDark={onDark} />
      <span className="hidden h-6 w-px bg-current opacity-20 sm:block" />
      <span className="hidden text-[13px] font-semibold uppercase tracking-widest opacity-70 sm:inline">
        Overdrive Nav
      </span>
    </div>
  );
}
