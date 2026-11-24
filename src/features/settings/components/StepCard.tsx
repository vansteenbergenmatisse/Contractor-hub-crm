import { Fragment, memo, type ReactNode } from "react";
import { labelOfKey } from "../api/fields";
import { clearedKeys, filledCount, type Step } from "../api/steps";
import type { CustomValues, Field, Problem } from "../types";
import { StepField } from "./StepField";

// What every card shares. The parent keeps this object stable, so typing re-renders one card only.
export type StepContext = {
  live: boolean;
  readOnly: boolean;
  blocked: boolean;
  imageHosts?: readonly string[];
  // Keys listed by name only, read-only (value too long to send).
  longKeys: ReadonlySet<string>;
  onEdit: (key: string, value: string) => void;
  onSave: (id: string) => void;
  onConfirmClear: (id: string) => void;
  onKeep: (id: string) => void;
  onCancel: (id: string) => void;
  imageControl: (field: Field, saved: string, dirty: boolean) => ReactNode;
};

type Props = {
  step: Step;
  number: number;
  total: number;
  keys: readonly string[];
  // Fewer fields on screen than `keys` while "Only show empty fields" is on.
  shownKeys: readonly string[];
  values: CustomValues;
  draft: CustomValues;
  error: Problem | null;
  current: boolean;
  saving: boolean;
  anySaving: boolean;
  savedHere: boolean;
  problem: string | null;
  reviewing: boolean;
  context: StepContext;
};

const isDirty = (keys: readonly string[], values: CustomValues, draft: CustomValues) =>
  keys.some((key) => (draft[key] ?? "").trim() !== (values[key] ?? "").trim());

function StepCardView({ step, number, total, keys, shownKeys, values, draft, error, current, saving, anySaving, savedHere, problem, reviewing, context }: Props) {
  const { live, readOnly, blocked, imageHosts, longKeys, onEdit, onSave, onConfirmClear, onKeep, onCancel, imageControl } = context;
  const dirty = isDirty(keys, values, draft);
  const filled = filledCount(keys, values, longKeys);
  const shownSet = new Set(shownKeys);
  // Sub-groups from the layout; one group on screen needs no heading.
  const groups = step.groups.map((g) => ({ ...g, keys: g.keys.filter((key) => shownSet.has(key)) })).filter((g) => g.keys.length > 0);
  const field = (key: string) => (
    <StepField key={key} fieldKey={key} value={draft[key] ?? ""} saved={values[key] ?? ""} error={error} readOnly={readOnly} imageHosts={imageHosts} onChange={onEdit} imageControl={imageControl} long={longKeys.has(key)} />
  );
  const cleared = reviewing ? clearedKeys(keys, values, draft) : [];
  const verb = live ? "Save" : "Apply";
  const hint = dirty
    ? (live ? "You have changes that are not saved yet." : "You have changes that are not applied yet.")
    : savedHere && live ? "Your account has these values." : `${filled} of ${keys.length} filled`;
  return (
    <section className={`ga-card${current ? " is-cur" : ""}${dirty ? " is-dirty" : ""}`} id={`s-card-${step.id}`} data-step={step.id} aria-labelledby={`s-t-${step.id}`}>
      <header className="ga-hd">
        <div className="ga-hdt">
          <p className="ga-eye">Step {number} of {total}</p>
          <h2 className="ga-t" id={`s-t-${step.id}`}>{step.title}</h2>
          <p className="ga-line">{step.line}</p>
        </div>
      </header>
      {shownKeys.length === 0 ? <p className="ga-none">Nothing is empty here.</p> : groups.length > 1 ? (
        <div className="ga-bd">
          {groups.map((g) => (
            <Fragment key={g.id}>
              <div className="ga-sgh"><h3 className="ga-sg">{g.title}</h3></div>
              <div className="sv-fields">{g.keys.map(field)}</div>
            </Fragment>
          ))}
        </div>
      ) : <div className="sv-fields">{shownKeys.map(field)}</div>}
      {cleared.length > 0 ? (
        <div className="ga-rv is-on" role="group" aria-labelledby={`s-r-${step.id}`}>
          <p className="ga-rt" id={`s-r-${step.id}`} tabIndex={-1}>Check before you clear</p>
          <p className="ga-rl">These will be empty in your account:</p>
          <ul className="ga-dl">{cleared.map((key) => <li key={key}>{labelOfKey(key)}: {values[key]}</li>)}</ul>
          <div className="ga-ga">
            <button type="button" className="sv-btn is-plain" onClick={() => onKeep(step.id)}>Go back</button>
            <button type="button" className="sv-btn is-danger" disabled={anySaving} onClick={() => onConfirmClear(step.id)}>Clear and save</button>
          </div>
        </div>
      ) : null}
      <footer className="ga-foot">
        <div className="ga-fn-wrap">
          {savedHere && !dirty ? (
            <p className="fd-okl" role="status" tabIndex={-1}><span>{live ? "Saved to your account." : "Changed for this visit only. Not saved to your account yet."}</span></p>
          ) : null}
          {problem ? <p className="ga-fe" role="alert" tabIndex={-1}>{problem}</p> : null}
          <p className={`ga-fn${dirty ? " is-dirty" : ""}`} role="status">{hint}</p>
        </div>
        {readOnly ? null : (
          <>
            <button type="button" className={`sv-btn is-ghost ga-cx${dirty ? "" : " is-off"}`} aria-label={`Cancel ${step.title}`} disabled={!dirty || saving} onClick={() => onCancel(step.id)}>Cancel</button>
            <button type="button" className="sv-btn is-fill ga-nx" aria-label={saving ? "Saving…" : `${verb} ${step.title}`} disabled={anySaving || blocked} onClick={() => onSave(step.id)}>{saving ? "Saving…" : verb}</button>
          </>
        )}
      </footer>
    </section>
  );
}

const sameKeys = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, i) => key === b[i]);

// Re-renders only when something this card shows has changed.
export const StepCard = memo(StepCardView, (a, b) =>
  a.step === b.step && a.number === b.number && a.total === b.total && a.context === b.context &&
  a.error === b.error && a.current === b.current && a.saving === b.saving && a.anySaving === b.anySaving &&
  a.savedHere === b.savedHere && a.problem === b.problem && a.reviewing === b.reviewing &&
  sameKeys(a.keys, b.keys) && sameKeys(a.shownKeys, b.shownKeys) &&
  a.keys.every((key) => a.values[key] === b.values[key] && a.draft[key] === b.draft[key]));
