import type { ReactNode } from "react";

// The few icons the calendar draws that the shell's icon set does not have. Same style as the
// design: 24x24, round caps, drawn inline.
const PATHS = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  pin: (<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  send: <path d="M21 3 10.5 13.5M21 3l-7 18-3.5-7.5L3 10z" />,
  swap: <path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
} satisfies Record<string, ReactNode>;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size = 15, strokeWidth = 2, className }: { name: GlyphName; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
