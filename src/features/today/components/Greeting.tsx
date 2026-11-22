import { greeting } from "../api/selectors";

// With no `left` (no real to-dos yet) the greeting claims no count.
export function Greeting({ first, left, numClass }: { first?: string; left?: number; numClass?: string }) {
  const g = left === undefined ? null : greeting(left);
  return (
    <section className="fd-hello fd-in" style={{ "--i": 0 } as React.CSSProperties}>
      <h1 className="fd-h1">{first?.trim() ? `Morning, ${first.trim()}.` : "Morning."}{g ? <> <strong className={numClass}>{g.count}</strong> {g.tail}</> : null}</h1>
    </section>
  );
}
