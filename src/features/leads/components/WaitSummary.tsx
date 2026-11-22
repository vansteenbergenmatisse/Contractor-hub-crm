import type { Summary } from "../types";
import { ChannelIcon } from "./ChannelIcon";

// How many leads wait, who waits longest, and one button for that lead.
export function WaitSummary({ summary, onGo }: { summary: Summary; onGo: () => void }) {
  return (
    <div className={`fd-wsum is-${summary.tone}`} role="status">
      <ChannelIcon className="fd-wsi fd-wsi-c" name="clock" size={18} strokeWidth={2.2} />
      <ChannelIcon className="fd-wsi fd-wsi-k" name="check" size={18} strokeWidth={2.2} />
      <p className="fd-wsx"><b>{summary.a}</b> <span>{summary.b}</span></p>
      <button type="button" className={`fd-wsgo${summary.button ? "" : " is-off"}`} onClick={onGo} tabIndex={summary.button ? 0 : -1}>{summary.button}</button>
    </div>
  );
}
