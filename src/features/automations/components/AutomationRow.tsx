"use client";

import { useRowGestures, type RowAction } from "@/features/app-shell";
import type { Automation } from "../types";
import { STOP, WHEN, rowActionSpecs, runLabel, whoLabel } from "../api/automations";

const svg = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

type Props = {
  a: Automation;
  // The Does line as shown (offer and reward filled in); defaults to the row's own text.
  does?: string;
  selected: boolean;
  asking: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAsk: () => void;
  onRemove: () => void;
  onKeep: () => void;
};

// One workflow row: name, who acts, runs this week, When / Does / Stops, the switch and the buttons.
// Swipe right presses the switch; a long press, right-click or the menu key opens the row menu
// (design uxActs / uxItems).
export function AutomationRow({ a, does, selected, asking, onToggle, onEdit, onAsk, onRemove, onKeep }: Props) {
  const run = { toggle: onToggle, edit: onEdit, ask: onAsk, remove: onRemove, keep: onKeep };
  const actions: RowAction[] = rowActionSpecs(a, asking).map(({ key, ...spec }) => ({ ...spec, onAction: run[key] }));
  const gestures = useRowGestures<HTMLDivElement>({ label: a.name, actions });
  return (
    <div {...gestures} tabIndex={0} className={`fd-rw${selected ? " is-sel" : ""}`} id={`fd-au-${a.id}`}>
      <div className="fd-rm">
        <div className="fd-rbx">
          <div className="fd-rtg fd-auh">
            <p className="fd-rn"><span className="fd-h">{a.name}</span></p>
            <span className={`fd-chip ${a.who === "ok" ? "is-warn" : "is-plain"}`}>
              <svg className="i-w" {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              <svg className="i-b" {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
              <svg className="i-o" {...svg}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              <span className="fd-h">{whoLabel(a.who)}</span>
            </span>
            <span className="fd-ran"><span className="fd-h">{runLabel(a)}</span></span>
          </div>
          <dl className="fd-wds">
            <div><dt>When</dt><dd><span className="fd-h">{WHEN[a.when]}</span></dd></div>
            <div><dt>Does</dt><dd><span className="fd-h">{does ?? a.does}</span></dd></div>
            <div><dt>Stops</dt><dd><span className="fd-h">{STOP[a.stop]}</span></dd></div>
          </dl>
        </div>
      </div>
      <div className="fd-rac">
        <button type="button" className={`fd-swb${a.on ? " is-on" : ""}`} role="switch" aria-checked={a.on} aria-label={a.name} onClick={onToggle}>
          <i aria-hidden="true" /><span><span className="fd-h">{a.on ? "On" : "Off"}</span></span>
        </button>
        <button type="button" className={`fd-btn is-plain${asking ? " is-off" : ""}`} id={`fd-au-edit-${a.id}`} onClick={onEdit}>Edit</button>
        <button type="button" className={`fd-btn is-danger${asking ? " is-off" : ""}`} onClick={onAsk}>Remove</button>
        <span className={`fd-rask${asking ? "" : " is-off"}`}>Remove it?</span>
        <button type="button" className={`fd-btn is-danger${asking ? "" : " is-off"}`} onClick={onRemove}>Yes, remove</button>
        <button type="button" className={`fd-btn is-plain${asking ? "" : " is-off"}`} onClick={onKeep}>Keep</button>
      </div>
    </div>
  );
}
