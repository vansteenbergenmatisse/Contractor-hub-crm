import { greeting } from "../api/selectors";

export function Greeting({ first, left, numClass }: { first?: string; left: number; numClass: string }) {
  const g = greeting(left);
  return (
    <section className="fd-hello fd-in" style={{ "--i": 0 } as React.CSSProperties}>
      <h1 className="fd-h1">{first?.trim() ? `Morning, ${first.trim()}.` : "Morning."} <strong className={numClass}>{g.count}</strong> {g.tail}</h1>
    </section>
  );
}
