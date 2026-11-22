import type { ReactNode } from "react";

// The small icons the design draws inline on this page (24x24, round caps).
const PATHS: Record<"chevron" | "clock" | "check" | "alert" | "pin" | "trend", ReactNode> = {
  chevron: <path d="m9 6 6 6-6 6" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></>),
  pin: (<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  trend: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
};

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size = 13, strokeWidth = 2.2 }: { name: GlyphName; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
