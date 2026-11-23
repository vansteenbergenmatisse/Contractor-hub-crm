import type { ReactNode } from "react";
import { greeting } from "../api/selectors";

// With no `left` (no real to-dos yet) the greeting claims no count. `word` is the client's time of
// day from the server; without one it keeps the design's wording.
export function Greeting({ first, left, numClass, word = "Morning" }: { first?: string; left?: number; numClass?: string; word?: ReactNode }) {
  const g = left === undefined ? null : greeting(left);
  return (
    <section className="fd-hello fd-in" style={{ "--i": 0 } as React.CSSProperties}>
      <h1 className="fd-h1">{word}{first?.trim() ? `, ${first.trim()}.` : "."}{g ? <> <strong className={numClass}>{g.count}</strong> {g.tail}</> : null}</h1>
    </section>
  );
}
