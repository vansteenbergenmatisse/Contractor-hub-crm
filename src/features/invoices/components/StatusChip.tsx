import type { Chip } from "../types";

const ICON = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

// A status is a word plus an icon. The design's CSS shows the clock (waiting), the alert (late)
// or the check (done) depending on the chip's tone.
export function StatusChip({ chip }: { chip: Chip }) {
  return (
    <span className={`fd-chip ${chip.tone}`}>
      <svg className="i-w" {...ICON}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      <svg className="i-b" {...ICON}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
      <svg className="i-o" {...ICON}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      <span className="fd-h">{chip.text}</span>
    </span>
  );
}
