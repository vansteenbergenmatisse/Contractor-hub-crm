import { chipClass, statusText } from "../api/quotes";
import type { Quote } from "../types";

const icon = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false" } as const;

// A status is a word plus an icon (CSS shows the one that fits the chip color).
export function StatusChip({ quote }: { quote: Quote }) {
  return (
    <span className={chipClass(quote)}>
      <svg className="i-w" {...icon}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      <svg className="i-b" {...icon}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
      <svg className="i-o" {...icon}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      {statusText(quote)}
    </span>
  );
}
