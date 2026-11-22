import { STAGES } from "../api/stages";

// The parts of one stage column on the computer. The board is one CSS grid: the cards sit in it
// directly and the classes `is-sN` and `is-rN` place them, so a column is its header plus its
// "No cards here" and "N more" notes (rendered by the parent in grid order).
export function StageHeader({ stage, className, count, countClassName }: { stage: number; className: string; count: number; countClassName: string }) {
  return (
    <header className={className}>
      <h2 className="fd-khn">{STAGES[stage].name}</h2>
      <span className={countClassName}>{count}</span>
    </header>
  );
}

export function StageEmpty({ className }: { className: string }) {
  return <p className={className}>No cards here</p>;
}

export function StageMore({ stage, count }: { stage: number; count: number }) {
  return <p className={`fd-kmore is-s${stage}`}>{`${count} more in ${STAGES[stage].name}`}</p>;
}
