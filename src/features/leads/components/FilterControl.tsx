"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { filterKeyIndex } from "../api/leads-logic";
import type { WaitFilter } from "../types";

const OPTIONS: ReadonlyArray<{ key: WaitFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "warn", label: "Under 1 Hr" },
  { key: "bad", label: "1–24 Hrs" },
  { key: "hot", label: "24+ Hrs" },
];

type Props = { value: WaitFilter; counts: Record<WaitFilter, number>; onChange: (f: WaitFilter) => void };

// Segmented control: one radio group. Arrow keys, Home and End move between the options.
export function FilterControl({ value, counts, onChange }: Props) {
  const index = OPTIONS.findIndex((o) => o.key === value);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = filterKeyIndex(e.key, index, OPTIONS.length);
    if (next < 0) return;
    e.preventDefault();
    onChange(OPTIONS[next].key);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  };
  return (
    <div className="fd-wseg" role="radiogroup" aria-label="Show who waits" style={{ "--seg": index } as CSSProperties} onKeyDown={onKey}>
      <span className="fd-wsk" aria-hidden="true" />
      {OPTIONS.map((o) => (
        <button key={o.key} type="button" role="radio" className={`fd-wsb${value === o.key ? " is-on" : ""}`} aria-checked={value === o.key} tabIndex={value === o.key ? 0 : -1} onClick={() => onChange(o.key)}>
          <span className="fd-wsl">{o.label}</span> <span className="fd-wsn">{counts[o.key]}</span>
        </button>
      ))}
    </div>
  );
}
