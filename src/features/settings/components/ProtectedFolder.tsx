import { memo, useEffect, useRef, useState } from "react";
import { labelOfKey } from "../api/fields";
import { filledCount, type ProtectedId, type Step } from "../api/steps";
import type { CustomValues, Problem } from "../types";
import { ValueField } from "./ValueField";

export type FolderMode = "locked" | "gate" | "edit" | "review";

type Props = {
  step: Step<ProtectedId>;
  keys: readonly string[];
  values: CustomValues;
  draft: CustomValues;
  mode: FolderMode;
  error: Problem | null;
  problem: string | null;
  readOnly: boolean;
  blocked: boolean;
  saving: boolean;
  anySaving: boolean;
  // Another folder is unlocked: one at a time.
  otherOpen: boolean;
  onMode: (id: ProtectedId, mode: FolderMode) => void;
  onEdit: (key: string, value: string) => void;
  onLock: (id: ProtectedId) => void;
  onSave: (id: ProtectedId) => void;
};

const shown = (value: string | undefined) => (value ?? "").trim() || "(empty)";
const ANNOUNCED: Record<FolderMode, string> = {
  locked: "Locked.",
  gate: "Tick the box to unlock.",
  edit: "Unlocked. You can make changes.",
  review: "Check your changes.",
};

function ProtectedFolderView({ step, keys, values, draft, mode, error, problem, readOnly, blocked, saving, anySaving, otherOpen, onMode, onEdit, onLock, onSave }: Props) {
  const [ack, setAck] = useState(false);
  const changed = keys.filter((key) => (draft[key] ?? "").trim() !== (values[key] ?? "").trim());
  const go = (next: FolderMode) => { setAck(false); onMode(step.id, next); };
  const root = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const lastMode = useRef(mode);

  // Each stage removes the button that was pressed, so focus moves to the start of the new stage.
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    const box = root.current;
    if (!box) return;
    const pick = (selector: string) => box.querySelector<HTMLElement>(selector);
    const target = mode === "gate" ? pick('[role="checkbox"]')
      : mode === "edit" ? pick('input[aria-invalid="true"]:not([readonly])') ?? pick("input:not([readonly])")
      : mode === "review" ? pick(".ga-rt")
      : pick("button.ga-pfb:not([disabled])") ?? pick(".ga-pfn");
    target?.focus();
    if (status.current) status.current.textContent = ANNOUNCED[mode];
  }, [mode]);

  return (
    <div ref={root} className={`ga-pf is-${mode}`} id={`s-card-${step.id}`} data-step={step.id} role="group" aria-labelledby={`s-t-${step.id}`}>
      <p ref={status} className="ga-sr" role="status" />
      <div className="ga-pfh">
        <div className="ga-pft">
          <h3 className="ga-pfn" id={`s-t-${step.id}`} tabIndex={-1}>{step.title}</h3>
          <div className="ga-meta"><span className="sv-chip">{filledCount(keys, values)} of {keys.length} filled</span></div>
        </div>
        <span className={`ga-pst ${mode === "locked" || mode === "gate" ? "is-lock" : "is-open"}`}>{mode === "locked" || mode === "gate" ? "Locked" : "Unlocked"}</span>
        {mode === "locked" && !readOnly ? (
          <button type="button" className="sv-btn is-plain ga-pfb" aria-label={`Unlock ${step.title} to change`} disabled={otherOpen || blocked} onClick={() => go("gate")}>Unlock to change</button>
        ) : null}
      </div>
      {mode === "gate" ? (
        <div className="ga-gate" role="group" aria-labelledby={`s-g-${step.id}`}>
          <p className="ga-gt" id={`s-g-${step.id}`}>Change {step.title}?</p>
          <p className="ga-gl">These names build pages on your website. A wrong change can break a page or drop it from Google.</p>
          <button type="button" role="checkbox" aria-checked={ack} className={`ga-cb${ack ? " is-on" : ""}`} onClick={() => setAck(!ack)}>
            <span className="ga-cbx" aria-hidden="true">{ack ? "✓" : ""}</span>
            <span>I understand. My website pages change too.</span>
          </button>
          <div className="ga-ga">
            <button type="button" className="sv-btn is-plain" onClick={() => go("locked")}>Keep it locked</button>
            <button type="button" className={`sv-btn is-fill${ack ? "" : " is-dis"}`} disabled={!ack} onClick={() => go("edit")}>Unlock</button>
          </div>
        </div>
      ) : null}
      <div className="sv-fields ga-pfields">
        {keys.map((key) => (
          <ValueField
            key={key}
            field={{ key, label: labelOfKey(key) }}
            value={draft[key] ?? ""}
            saved={values[key] ?? ""}
            invalid={error?.key === key}
            error={error?.key === key ? error.message : undefined}
            readOnly={readOnly || mode !== "edit"}
            onChange={onEdit}
          />
        ))}
      </div>
      {mode === "edit" ? (
        <div className="ga-eb">
          <p className={`ga-edn${changed.length > 0 ? " is-chg" : ""}`}>{changed.length === 0 ? "No changes yet" : `${changed.length} changed`}</p>
          <button type="button" className="sv-btn is-plain" onClick={() => onLock(step.id)}>Lock without saving</button>
          <button type="button" className={`sv-btn is-fill${changed.length > 0 ? "" : " is-dis"}`} disabled={changed.length === 0} onClick={() => go("review")}>Check my changes</button>
        </div>
      ) : null}
      {mode === "review" ? (
        <div className="ga-rv" role="group" aria-labelledby={`s-r-${step.id}`}>
          <p className="ga-rt" id={`s-r-${step.id}`} tabIndex={-1}>Check your changes</p>
          <p className="ga-rl">Your website pages change once you save.</p>
          <ul className="ga-dl">{changed.map((key) => <li key={key}>{labelOfKey(key)}: {shown(values[key])} to {shown(draft[key])}</li>)}</ul>
          <div className="ga-ga">
            <button type="button" className="sv-btn is-plain" disabled={saving} onClick={() => go("edit")}>Back to editing</button>
            <button type="button" className="sv-btn is-fill" aria-label={saving ? "Saving…" : `Save ${step.title}`} disabled={anySaving} onClick={() => onSave(step.id)}>{saving ? "Saving…" : "Save and lock"}</button>
          </div>
        </div>
      ) : null}
      {problem ? <p className="ga-fe" role="alert">{problem}</p> : null}
    </div>
  );
}

export const ProtectedFolder = memo(ProtectedFolderView, (a, b) =>
  a.step === b.step && a.mode === b.mode && a.error === b.error && a.problem === b.problem && a.readOnly === b.readOnly &&
  a.blocked === b.blocked && a.saving === b.saving && a.anySaving === b.anySaving && a.otherOpen === b.otherOpen &&
  a.onMode === b.onMode && a.onEdit === b.onEdit && a.onLock === b.onLock && a.onSave === b.onSave &&
  a.keys.length === b.keys.length && a.keys.every((key, i) => key === b.keys[i] && a.values[key] === b.values[key] && a.draft[key] === b.draft[key]));
