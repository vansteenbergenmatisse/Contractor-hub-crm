import type { ReactNode } from "react";
import type { Channel } from "../types";

// Channel colors live in the CSS (fixed, not custom values). The icon and the word always go together.
const ICONS: Record<Channel, { cls: string; paths: ReactNode }> = {
  Call: { cls: "is-call", paths: <path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" /> },
  Text: { cls: "is-text", paths: (<><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8 9.5h8M8 12.8h5" /></>) },
  Facebook: { cls: "is-fb", paths: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2" /></> },
  Email: { cls: "is-email", paths: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7.5 8.5 6 8.5-6" /></>) },
  "Web form": { cls: "is-form", paths: (<><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>) },
  Instagram: { cls: "is-ig", paths: (<><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>) },
};

export function ChannelIcon({ channel }: { channel: Channel }) {
  const { cls, paths } = ICONS[channel];
  return (
    <span className={`fd-cht ${cls}`} aria-hidden="true">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths}</svg>
    </span>
  );
}
