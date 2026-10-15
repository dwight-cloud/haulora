/**
 * Design-system primitives. Import from here instead of rolling card/button
 * styles inline in every page, so changes to the visual language propagate.
 *
 * Rhythm: 0.75 rem (gap-3) between siblings, 1.25 rem (p-5) inside cards.
 * Touch targets: every interactive primitive is at least 44 px tall on mobile.
 */
import * as React from "react";

type Cx = string | undefined | null | false;
export function cx(...parts: Cx[]): string { return parts.filter(Boolean).join(" "); }

// -------- Page header --------

export function PageHeader({
  eyebrow, title, subtitle, right,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-bitumen-900 md:text-[28px]">
          {title}
        </h1>
        {subtitle && <div className="mt-1 text-sm text-bitumen-500">{subtitle}</div>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("text-[11px] font-semibold uppercase tracking-[0.14em] text-rust-600", className)}>
      {children}
    </div>
  );
}

// -------- Card --------

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx("rounded-xl border border-bitumen-200 bg-white shadow-card", className)}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("flex items-center justify-between gap-3 border-b border-bitumen-100 px-5 py-3.5", className)} />;
}
export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("p-5", className)} />;
}
export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...rest} className={cx("text-sm font-semibold text-bitumen-900", className)} />;
}

// -------- Button --------

type Tone = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BUTTON_TONE: Record<Tone, string> = {
  primary:   "bg-bitumen-900 text-white hover:bg-bitumen-800",
  accent:    "bg-rust-500 text-white hover:bg-rust-600 shadow-card-lg",
  secondary: "bg-white text-bitumen-700 ring-1 ring-inset ring-bitumen-200 hover:bg-bitumen-50",
  ghost:     "bg-transparent text-bitumen-700 hover:bg-bitumen-100",
  danger:    "bg-red-600 text-white hover:bg-red-700",
};
const BUTTON_SIZE: Record<Size, string> = {
  sm: "min-h-[44px] md:min-h-0 md:h-8 px-3 text-[13px]",
  md: "min-h-[44px] md:min-h-0 md:h-9 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function Button({
  tone = "secondary", size = "md", icon, children, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone; size?: Size; icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_TONE[tone], BUTTON_SIZE[size], className
      )}
    >
      {icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}

// -------- Pill (status indicator) --------

export type PillTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
const PILL_DOT: Record<PillTone, string> = {
  neutral: "bg-bitumen-400",
  success: "bg-gum-500",
  warning: "bg-status-held",
  danger:  "bg-status-delayed",
  info:    "bg-status-enroute",
  accent:  "bg-rust-500",
};
const PILL_FILL: Record<PillTone, string> = {
  neutral: "border-bitumen-200 bg-white text-bitumen-700",
  success: "border-gum-200 bg-gum-50 text-gum-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger:  "border-red-200 bg-red-50 text-red-800",
  info:    "border-blue-200 bg-blue-50 text-blue-900",
  accent:  "border-rust-200 bg-rust-50 text-rust-800",
};

export function Pill({
  tone = "neutral", children, className, filled = false,
}: { tone?: PillTone; children: React.ReactNode; className?: string; filled?: boolean }) {
  return (
    <span className={cx(
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold",
      filled ? PILL_FILL[tone] : "border-bitumen-200 bg-white text-bitumen-700",
      className
    )}>
      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", PILL_DOT[tone])} />
      {children}
    </span>
  );
}

// -------- Stat --------
// A number with a label above and a sub-line below. Heights are reserved so
// the KPI strip does not shift when data arrives.

export function Stat({
  label, value, sub, tone = "neutral", loading = false,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: PillTone; loading?: boolean;
}) {
  return (
    <Card className="min-h-[112px]">
      <CardBody className="flex h-full flex-col px-4 py-3.5">
        <div className="flex min-h-[28px] items-start justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase leading-[14px] tracking-[0.1em] text-bitumen-500">{label}</div>
          <span className={cx("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", PILL_DOT[tone])} />
        </div>
        {loading ? (
          <div className="mt-2.5 h-7 w-20 animate-pulse rounded bg-bitumen-100" />
        ) : (
          <div className="mt-1.5 truncate text-[26px] font-bold leading-8 tracking-tight text-bitumen-900 tabular-nums">{value}</div>
        )}
        <div className="mt-auto min-h-[18px] truncate pt-0.5 text-[12px] text-bitumen-500">{loading ? "" : sub ?? " "}</div>
      </CardBody>
    </Card>
  );
}

// -------- Section header (inline, within a page) --------

export function SectionHeader({
  title, subtitle, right,
}: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-bitumen-900">{title}</h2>
        {subtitle && <div className="mt-0.5 text-xs text-bitumen-500">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

// -------- Icon button (for map overlay actions, etc.) --------

export function IconButton({
  className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-bitumen-200 bg-white text-bitumen-600 shadow-card transition hover:bg-bitumen-50 disabled:opacity-50 md:h-8 md:w-8 [&>svg]:h-4 [&>svg]:w-4",
        className
      )}
    >
      {children}
    </button>
  );
}

// -------- Alerts --------

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
      {children}
    </div>
  );
}

// -------- Empty state --------

export function EmptyState({
  title, body, action,
}: { title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="text-sm font-semibold text-bitumen-900">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[13px] leading-6 text-bitumen-500">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
