import { useId } from "react";
import { GLOSSARY, type GlossaryTerm } from "@/lib/ui/plain";

/**
 * Renders the plain word for a glossary term with a small "?" that shows the
 * one-line explanation on hover or keyboard focus. Pure CSS tooltip, no
 * dependency; works in server and client components. The `title` attribute
 * is the fallback where hover tooltips do not apply (touch, screen readers
 * read the aria-describedby text).
 *
 *   <Term t="fuel levy" />            → fuel surcharge (?)
 *   <Term t="fuel levy">surcharges</Term> → surcharges (?)  (same explanation)
 */
export function Term({ t, children, className = "", hint = true }: { t: GlossaryTerm; children?: React.ReactNode; className?: string; hint?: boolean }) {
  const entry = GLOSSARY[t];
  const id = useId();
  const word = children ?? entry.plain;
  if (!hint) return <span className={className}>{word}</span>;
  return (
    <span className={`group/term relative inline-flex items-baseline gap-0.5 ${className}`}>
      <span>{word}</span>
      <span
        tabIndex={0}
        role="img"
        aria-label={`What does "${entry.plain}" mean?`}
        aria-describedby={id}
        title={entry.explain}
        className="inline-flex h-[14px] w-[14px] shrink-0 cursor-help select-none items-center justify-center self-center rounded-full border border-current text-[9px] font-bold leading-none opacity-50 outline-none transition hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-rust-400"
      >?</span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-[90] mt-1.5 hidden w-64 max-w-[80vw] whitespace-normal rounded-lg border border-bitumen-200 bg-bitumen-900 px-3 py-2 text-left text-[12px] font-normal normal-case leading-5 tracking-normal text-white shadow-card-lg group-hover/term:block group-focus-within/term:block"
      >
        {entry.explain}
      </span>
    </span>
  );
}
