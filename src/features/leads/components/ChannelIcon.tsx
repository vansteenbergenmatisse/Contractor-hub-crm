import type { ReactNode } from "react";
import type { SourceKey } from "../types";

// Plain icons per source (never a hand-drawn brand logo). Color comes from the .is-<key> class.
const PATHS: Record<SourceKey | "email" | "website" | "bing" | "gads" | "unknown" | "you" | "pin" | "reply" | "clock" | "alert" | "check" | "plus", ReactNode> = {
  call: <path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" />,
  form: (<><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>),
  text: (<><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8 9.5h8M8 12.8h5" /></>),
  gmb: (<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>),
  fb: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2" /></>),
  ig: (<><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>),
  email: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>),
  website: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" /></>),
  bing: (<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><path d="M9.5 9.5h5" /></>),
  gads: (<><path d="M4 10v4l11 4V6z" /><path d="M15 9a3 3 0 0 1 0 6M7 15l1 5h3l-1-4" /></>),
  unknown: (<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 16.7v.3" /></>),
  you: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  pin: (<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  reply: <path d="M4 5h16v11H10l-5 4v-4H4z" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  alert: (<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></>),
  check: (<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.6" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
};

export type ChannelIconName = keyof typeof PATHS;

export function ChannelIcon({ name, size = 19, strokeWidth = 2, className }: { name: ChannelIconName; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
