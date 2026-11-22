import { waitClass, isWaiting, SOURCE_LABEL } from "../api/leads-logic";
import type { Lead, LeadStatus } from "../types";
import { ChannelIcon } from "./ChannelIcon";
import { WaitChip } from "./WaitChip";

const STATUS_CHIP: Record<Exclude<LeadStatus, "call" | "reply">, [string, string]> = {
  booked: ["is-ok", "Estimate booked"],
  auto: ["is-plain", "Auto-reply sent"],
  follow: ["is-plain", "Following up"],
  called: ["is-ok", "Called just now"],
};

type Props = {
  lead: Lead;
  status: LeadStatus;
  // The first waiting lead carries the one filled button.
  main: boolean;
  onCall: () => void;
  onReply: () => void;
  onBook: () => void;
};

export function LeadRow({ lead, status, main, onCall, onReply, onBook }: Props) {
  const waiting = isWaiting(status);
  const [tone, label] = waiting ? [waitClass(lead.mins), status === "reply" ? "Reply" : "Call back"] : STATUS_CHIP[status as keyof typeof STATUS_CHIP];
  const chipText = waiting ? `${label} · waiting ${lead.when}` : label;
  const mainClass = `fd-btn ${main ? "is-fill" : "is-plain"}`;
  return (
    <div className="fd-rw">
      <div className="fd-rm">
        <span className={`fd-cht is-${lead.source}`} aria-hidden="true"><ChannelIcon name={lead.source} /></span>
        <div className="fd-rbx">
          <p className="fd-rl1">
            <span className="fd-rn">{lead.name}</span>
            <WaitChip className={`fd-chip ${tone}`}>{chipText}</WaitChip>
          </p>
          <p className="fd-rsb"><b className="fd-srw">{SOURCE_LABEL[lead.source]}</b><span>{lead.need} · {lead.when}</span></p>
          <p className="fd-rad"><ChannelIcon name="pin" size={14} /><span>{lead.address}</span></p>
        </div>
      </div>
      <div className="fd-rac">
        {status === "reply" ? (
          <button type="button" className={mainClass} onClick={onReply} aria-label={`Reply to ${lead.name}`}>
            <ChannelIcon name="reply" size={15} />Reply
          </button>
        ) : (
          <button type="button" className={mainClass} onClick={onCall} aria-label={`Call ${lead.name}`}>
            <ChannelIcon name="call" size={15} />Call
          </button>
        )}
        <button type="button" className="fd-btn is-plain" onClick={onBook}>{status === "booked" ? "Undo booking" : "Book visit"}</button>
      </div>
    </div>
  );
}
