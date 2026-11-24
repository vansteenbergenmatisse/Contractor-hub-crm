import { useRef } from "react";
import { PROTECTED_STEPS, STEPS, filledCount, type StepKeys } from "../api/steps";
import { useStepSheet } from "../hooks/use-step-sheet";
import type { CustomValues } from "../types";
import { RailStep } from "./RailStep";

type Props = {
  keys: StepKeys;
  values: CustomValues;
  dirtyKeys: readonly string[];
  current: string;
  sheetOpen: boolean;
  onlyEmpty: boolean;
  onOnlyEmpty: () => void;
  onJump: (id: string) => void;
  onCloseSheet: () => void;
};

// The step list with real progress, counted from the saved values. On a phone it is a bottom sheet.
export function StepRail({ keys, values, dirtyKeys, current, sheetOpen, onlyEmpty, onOnlyEmpty, onJump, onCloseSheet }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useStepSheet(root, sheetOpen, onCloseSheet);
  const main = STEPS.filter((step) => keys[step.id].length > 0);
  const locked = PROTECTED_STEPS.filter((step) => keys[step.id].length > 0);
  const total = main.reduce((sum, step) => sum + keys[step.id].length, 0);
  const filled = main.reduce((sum, step) => sum + filledCount(keys[step.id], values), 0);
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  const sub = (id: keyof StepKeys) => {
    if (keys[id].some((key) => dirtyKeys.includes(key))) return "Not saved yet";
    return `${filledCount(keys[id], values)} of ${keys[id].length} filled`;
  };
  return (
    <div
      ref={root}
      className={`ga-rail${sheetOpen ? " is-sheet" : ""}`}
      role={sheetOpen ? "dialog" : "complementary"}
      aria-modal={sheetOpen ? true : undefined}
      aria-labelledby={sheetOpen ? "ga-sheet-title" : undefined}
      aria-label={sheetOpen ? undefined : "Steps"}
    >
      <div className="ga-shh">
        <p className="ga-sht" id="ga-sheet-title">Jump to a step</p>
        <button type="button" className="ga-x" aria-label="Close" onClick={onCloseSheet}>×</button>
      </div>
      <div className="ga-prog sv-card">
        <span className="sv-ring ga-pring" style={{ "--p": percent } as React.CSSProperties}><span className="ga-pct">{percent}%</span></span>
        <span className="ga-pt">
          <span className="ga-ptn">{filled} of {total} filled</span>
          <span className="ga-pts">{total - filled === 0 ? "Nothing left to fill in" : `${total - filled} left to fill in`}</span>
        </span>
      </div>
      <nav className="ga-list sv-card" aria-label="Your details">
        <p className="ga-lh">Your details in {STEPS.length} steps</p>
        <ol className="ga-steps">
          {main.map((step) => (
            <RailStep key={step.id} id={step.id} title={step.title} sub={sub(step.id)} mark={String(STEPS.indexOf(step) + 1)} done={filledCount(keys[step.id], values) === keys[step.id].length} current={current === step.id} onJump={onJump} />
          ))}
        </ol>
      </nav>
      {locked.length > 0 ? (
        <nav className="ga-list ga-lk sv-card" aria-label="Services and areas">
          <div className="ga-lkh"><span className="ga-lkt">Services and areas</span><span className="ga-pchip">Protected</span></div>
          <ol className="ga-steps">
            {locked.map((step) => (
              <RailStep key={step.id} id={step.id} title={step.title} sub={sub(step.id)} mark="•" done={false} current={current === step.id} onJump={onJump} />
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="ga-opts sv-card">
        <div className="sv-swrow">
          <span className="sv-swt">Only show empty fields</span>
          <button type="button" className={`sv-switch${onlyEmpty ? " is-on" : ""}`} role="switch" aria-checked={onlyEmpty} aria-label="Only show empty fields" onClick={onOnlyEmpty}><span className="sv-swk" /></button>
          <span className="sv-onoff">{onlyEmpty ? "On" : "Off"}</span>
        </div>
      </div>
    </div>
  );
}
