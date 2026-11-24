import { svgProps } from "./svg-props";

type Props = { id: string; title: string; sub: string; mark: string; done: boolean; current: boolean; onJump: (id: string) => void };

// One line of the step rail.
export function RailStep({ id, title, sub, mark, done, current, onJump }: Props) {
  return (
    <li>
      <button type="button" className={`ga-step${done ? " is-done" : ""}${current ? " is-cur" : ""}`} aria-current={current ? "step" : undefined} onClick={() => onJump(id)}>
        <span className="ga-num">
          <span className="ga-nn">{mark}</span>
          <svg width="16" height="16" {...svgProps} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <span className="ga-stx"><span className="ga-stt">{title}</span><span className="ga-sts">{sub}</span></span>
      </button>
    </li>
  );
}
