"use client";

import { useRef } from "react";
import { useBusinessValues } from "@/features/app-shell";
import { STOP, WAIT, WHEN, testLine } from "../api/automations";
import type { Automation, Draft } from "../types";

const check = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

type Props = {
  target: Automation | null;
  isNew: boolean;
  open: boolean;
  draft: Draft;
  err: string;
  test: boolean;
  onChange: (change: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
  onTest: () => void;
  onMake: () => void;
};

// The side panel (computer) or the pushed detail (phone): four numbered steps, Save, Send me a test.
export function AutomationEditor({ target, isNew, open, draft, err, test, onChange, onSave, onCancel, onTest, onMake }: Props) {
  const values = useBusinessValues();
  const nameRef = useRef<HTMLInputElement>(null);
  // Save with no name puts the cursor in the name field, on every press (design save()).
  const save = () => {
    onSave();
    if (!draft.name.trim()) nameRef.current?.focus();
  };

  const title = isNew ? "New automation" : open && target ? `Edit: ${target.name}` : "Change an automation";
  const sub = open ? "Change what you need. Then press Save. It runs for the next customer." : "Press Edit on a row to change its text or timing. Or make a new one.";

  return (
    <section className="fd-pnl" aria-labelledby="fd-au-h" aria-live="polite">
      <button type="button" className="fd-link fd-aback" onClick={onCancel}>
        <svg className="fd-flip" {...check}><path d="m9 6 6 6-6 6" /></svg>Back to the list
      </button>
      <h2 className="fd-pnh" id="fd-au-h"><span className="fd-h">{title}</span></h2>
      <p className="fd-pns"><span className="fd-h">{sub}</span></p>
      <div className={`fd-auf${open ? "" : " is-off"}`}>
        <label className="fd-ll" htmlFor="fd-au-name">Name</label>
        <input ref={nameRef} className="fd-lin" id="fd-au-name" type="text" autoComplete="off" value={draft.name}
          aria-invalid={err ? true : undefined} aria-describedby={err ? "fd-au-err" : undefined} onChange={(e) => onChange({ name: e.target.value })} />
        <p className={`fd-lerr${err ? "" : " is-off"}`} role="alert" id="fd-au-err">
          <svg {...check}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
          <span><span className="fd-h">{err}</span></span>
        </p>
        <label className="fd-ll" htmlFor="fd-au-when">1. When it starts</label>
        <select className="fd-lin" id="fd-au-when" value={draft.when} onChange={(e) => onChange({ when: Number(e.target.value) })}>
          {WHEN.map((w, i) => <option key={w} value={i}>{w}</option>)}
        </select>
        <label className="fd-ll" htmlFor="fd-au-wait">2. How soon</label>
        <select className="fd-lin" id="fd-au-wait" value={draft.wait} onChange={(e) => onChange({ wait: Number(e.target.value) })}>
          {WAIT.map((w, i) => <option key={w} value={i}>{w}</option>)}
        </select>
        <label className="fd-ll" htmlFor="fd-au-msg">3. The text that goes out</label>
        <textarea className="fd-lin" id="fd-au-msg" rows={4} value={draft.msg} onChange={(e) => onChange({ msg: e.target.value })} />
        <p className="fd-pns fd-hint">Words in {"{curly brackets}"} fill themselves in for each customer.</p>
        <label className="fd-ll" htmlFor="fd-au-stop">4. When it stops</label>
        <select className="fd-lin" id="fd-au-stop" value={draft.stop} onChange={(e) => onChange({ stop: Number(e.target.value) })}>
          {STOP.map((w, i) => <option key={w} value={i}>{w}</option>)}
        </select>
        <p className={`fd-okl fd-tst2${test ? "" : " is-off"}`} role="status">
          <svg {...check}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          <span><span className="fd-h">{test ? testLine({ business_phone_number: values.business_phone_number ?? "" }) : ""}</span></span>
        </p>
        <div className="fd-rac fd-pna">
          <button type="button" className="fd-btn is-fill" onClick={save}>Save</button>
          <button type="button" className="fd-btn is-plain" onClick={onTest}>Send me a test</button>
          <button type="button" className="fd-btn is-plain" onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <button type="button" className={`fd-btn fd-lgo${open ? " is-off" : ""}`} onClick={onMake}>
        <svg {...check}><path d="M12 5v14M5 12h14" /></svg>New automation
      </button>
    </section>
  );
}
