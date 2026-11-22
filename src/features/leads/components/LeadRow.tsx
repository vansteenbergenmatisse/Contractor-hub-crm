"use client";

import { useRowGestures, type RowAction } from "@/features/app-shell";
import { joinParts } from "@/shared/lib/join-parts";
import { waitClass, isWaiting, rowWhen, SOURCE_LABEL, waitText } from "../api/leads-logic";
import type { Lead, LeadStatus } from "../types";
import { ChannelIcon } from "./ChannelIcon";
import { WaitChip } from "./WaitChip";

const STATUS_CHIP: Record<Exclude<LeadStatus, "call" | "reply" | "new">, [string, string]> = {
  booked: ["is-ok", "Estimate booked"],
  auto: ["is-plain", "Auto-reply sent"],
  follow: ["is-plain", "Following up"],
  called: ["is-ok", "Called just now"],
};

type Props = {
  lead: Lead;
  // Missing when kept screen state has not seen this lead yet: the lead's own status applies.
  status: LeadStatus | undefined;
  // The first waiting lead carries the one filled button.
  main: boolean;
  onCall: () => void;
  onReply: () => void;
  onBook: () => void;
};

export function LeadRow({ lead, status: stored, main, onCall, onReply, onBook }: Props) {
  const status = stored ?? lead.status;
  // A real contact: no wait chip, and no button, because each would claim or send something.
  const readOnly = status === "new";
  const waiting = isWaiting(status);
  const [tone, label] = readOnly ? ["", ""] : waiting ? [waitClass(lead.minutesWaiting), status === "reply" ? "Reply" : "Call back"] : STATUS_CHIP[status as keyof typeof STATUS_CHIP];
  const chipText = waiting ? `${label} · waiting ${waitText(lead.minutesWaiting)}` : label;
  const mainClass = `fd-btn ${main ? "is-fill" : "is-plain"}`;
  const reply = status === "reply";
  // The row's buttons as its menu (long press, right-click, ContextMenu key, Shift+F10), in their order.
  // A swipe right runs the main button (Call or Reply); the row has no Mark done, so a swipe left does
  // nothing (design logic `uxActs` + `uxItems`; the design's buttons read "Call" and "Reply").
  const actions: RowAction[] = readOnly ? [] : [
    reply
      ? { label: "Reply", onAction: onReply, swipe: "right" }
      : { label: "Call", onAction: onCall, swipe: "right" },
    { label: status === "booked" ? "Undo booking" : "Book visit", onAction: onBook },
  ];
  const gestures = useRowGestures<HTMLDivElement>({ label: lead.name, actions });
  return (
    <div {...gestures} className="fd-rw" data-row-id={lead.id}>
      <div className="fd-rm">
        <span className={lead.source ? `fd-cht is-${lead.source}` : "fd-cht"} aria-hidden="true"><ChannelIcon name={lead.source ?? "clock"} /></span>
        <div className="fd-rbx">
          <p className="fd-rl1">
            <span className="fd-rn">{lead.name}</span>
            {!readOnly && <WaitChip className={`fd-chip ${tone}`}>{chipText}</WaitChip>}
          </p>
          <p className="fd-rsb">{lead.source && <b className="fd-srw">{SOURCE_LABEL[lead.source]}</b>}<span>{joinParts([lead.need, rowWhen(lead)])}</span></p>
          {lead.address && <p className="fd-rad"><ChannelIcon name="pin" size={14} /><span>{lead.address}</span></p>}
        </div>
      </div>
      <div className="fd-rac">
        {reply ? (
          <button type="button" className={mainClass} onClick={onReply} aria-label={`Reply to ${lead.name}`}>
            <ChannelIcon name="reply" size={15} />Reply
          </button>
        ) : (
          <button type="button" className={mainClass} onClick={onCall} disabled={readOnly} title={readOnly ? "Not available yet" : undefined} aria-label={`Call ${lead.name}`}>
            <ChannelIcon name="call" size={15} />Call
          </button>
        )}
        <button type="button" className="fd-btn is-plain" onClick={onBook} disabled={readOnly} title={readOnly ? "Not available yet" : undefined}>{status === "booked" ? "Undo booking" : "Book visit"}</button>
      </div>
    </div>
  );
}
