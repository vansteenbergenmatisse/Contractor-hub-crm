import type { MiniRow } from "../types";
import { Chip } from "./Chip";

// The small name · note · amount list of a money card.
export function MiniList({ rows }: { rows: readonly MiniRow[] }) {
  return (
    <ul className="fd-mini">
      {rows.map((row) => (
        <li key={row.name}>
          <span className="fd-mn">{row.name}</span>
          {row.late ? <Chip tone="bad" icon="alert">{row.late}</Chip> : <span className="fd-mq">{row.note}</span>}
          <span className="fd-ma">{row.amount}</span>
        </li>
      ))}
    </ul>
  );
}
