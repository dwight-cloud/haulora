/**
 * Design-system primitives. Import from here instead of rolling card/button
 * styles inline in every page, so changes to the visual language propagate.
 */
import * as React from "react";

type Cx = string | undefined | null | false;
function cx(...parts: Cx[]): string { return parts.filter(Boolean).join(" "); }

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
    <div className="flex items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 md:text-[28px]">
          {title}
        </h1>
        {subtitle && <div className="mt-1 text-sm text-ink-500">{subtitle}</div>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

// -------- Card --------

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx(
        "rounded-xl border border-ink-200 bg-white shadow-card",
        className
      )}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("flex items-center justify-between border-b border-ink-100 px-5 py-4", className)} />;
}
export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("p-5", className)} />;
}
export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...rest} className={cx("text-sm font-semibold text-ink-900", className)} />;
}

// -------- Button --------

type Tone = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BUTTON_TONE: Record<Tone, string> = {
  primary:   "bg-ink-900 text-white hover:bg-ink-800 focus-visible:outline-ink-900",
  secondary: "bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 focus-visible:outline-ink-300",
  ghost:     "bg-transparent text-ink-700 hover:bg-ink-100 focus-visible:outline-ink-300",
  danger:    "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
};
const BUTTON_SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
};

export function Button({
  tone = "secondary", size = "md", icon, children, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone; size?: Size; icon?: React.ReactNode;
}) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_TONE[tone], BUTTON_SIZE[size], className
      )}
    >
      {icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}

// -------- Pill (status indicator) --------
// Small dot + text. No filled color backgrounds — Samsara-style restraint.

type PillTone = "neutral" | "success" | "warning" | "danger" | "info";
const PILL_DOT: Record<PillTone, string> = {
  neutral: "bg-ink-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger:  "bg-red-500",
  info:    "bg-signal-500",
};

export function Pill({
  tone = "neutral", children, className,
}: { tone?: PillTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx(
      "inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-700",
      className
    )}>
      <span className={cx("h-1.5 w-1.5 rounded-full", PILL_DOT[tone])} />
      {children}
    </span>
  );
}

// -------- Stat --------
// A number with a label above and optional sub-note below. Used in KPI strips.

export function Stat({
  label, value, sub, tone = "neutral",
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: PillTone;
}) {
  return (
    <Card>
      <CardBody className="py-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            {label}
          </div>
          <span className={cx("h-1.5 w-1.5 rounded-full", PILL_DOT[tone])} />
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</div>
        {sub && <div className="mt-0.5 text-[12px] text-ink-500">{sub}</div>}
      </CardBody>
    </Card>
  );
}

// -------- Section header (inline, within a page) --------

export function SectionHeader({
  title, subtitle, right,
}: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {subtitle && <div className="mt-0.5 text-xs text-ink-500">{subtitle}</div>}
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
      {...rest}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 shadow-card transition hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300 disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4",
        className
      )}
    >
      {children}
    </button>
  );
}
