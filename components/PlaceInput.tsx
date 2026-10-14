"use client";

import { useEffect, useRef, useState } from "react";

export interface PlaceSuggestion {
  title: string;
  address: string;
  position: { lat: number; lon: number };
}

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect?: (p: PlaceSuggestion) => void;
  placeholder?: string;
}

export function PlaceInput({ label, value, onChange, onSelect, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!value || value.length < 2) { setItems([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        // Prefer HERE autosuggest for snappy typeahead; fall back to discover
        // for queries that look like full addresses.
        const res = await fetch(`/api/here/autosuggest?q=${encodeURIComponent(value)}&limit=6`);
        const data = await res.json();
        type AutoItem = { title: string; label?: string; position?: { lat: number; lon: number } };
        const items: PlaceSuggestion[] = (Array.isArray(data.items) ? data.items : []).map((i: AutoItem) => ({
          title: i.title,
          address: i.label ?? i.title,
          position: i.position ?? { lat: NaN, lon: NaN },
        }));
        setItems(items);
        setOpen(items.length > 0);
      } catch { setItems([]); }
      finally { setLoading(false); }
    }, 180);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value]);

  return (
    <div ref={wrapRef} className="relative">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">{label}</span>
        <div className="relative mt-1.5">
          <input
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => items.length > 0 && setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">…</span>
          )}
        </div>
      </label>

      {open && items.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-ink-200 bg-white shadow-card-lg">
          {items.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={async () => {
                  const finalLabel = p.address || p.title;
                  onChange(finalLabel);
                  let pos = p.position;
                  // Autosuggest doesn't always include coords — geocode on click.
                  if (!pos || !isFinite(pos.lat) || !isFinite(pos.lon)) {
                    try {
                      const g = await fetch(`/api/geocode?q=${encodeURIComponent(finalLabel)}`);
                      if (g.ok) {
                        const d = await g.json();
                        if (typeof d.lat === "number" && typeof d.lon === "number") pos = { lat: d.lat, lon: d.lon };
                      }
                    } catch { /* ignore */ }
                  }
                  if (pos && isFinite(pos.lat) && isFinite(pos.lon)) {
                    onSelect?.({ ...p, position: pos });
                  }
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-100"
              >
                <div className="font-semibold text-ink-900">{p.title}</div>
                <div className="text-xs text-ink-500">{p.address}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
