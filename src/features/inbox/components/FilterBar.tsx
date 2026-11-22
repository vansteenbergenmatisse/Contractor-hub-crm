import type { KeyboardEvent } from "react";
import type { Filter } from "../types";
import { FILTERS } from "../api/wait";

type Props = { filter: Filter; counts: Record<Filter, number>; onChange: (filter: Filter) => void };

// A radio group: arrow keys, Home and End move the choice, only the chosen button is a tab stop.
export function FilterBar({ filter, counts, onChange }: Props) {
  const index = FILTERS.findIndex((f) => f.key === filter);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const n = FILTERS.length;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % n
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + n - 1) % n
      : event.key === "Home" ? 0
      : event.key === "End" ? n - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(FILTERS[next].key);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(".fd-wsb");
    buttons[next]?.focus();
  }
  return (
    <div className="fd-wseg" role="radiogroup" aria-label="Show who waits" style={{ "--seg": index } as React.CSSProperties} onKeyDown={onKeyDown}>
      <span className="fd-wsk" aria-hidden="true"></span>
      {FILTERS.map((f) => (
        <button key={f.key} type="button" role="radio" className={`fd-wsb${filter === f.key ? " is-on" : ""}`} aria-checked={filter === f.key} tabIndex={filter === f.key ? 0 : -1} onClick={() => onChange(f.key)}>
          <span className="fd-wsl">{f.label}</span> <span className="fd-wsn"><span className="fd-h">{counts[f.key]}</span></span>
        </button>
      ))}
    </div>
  );
}
