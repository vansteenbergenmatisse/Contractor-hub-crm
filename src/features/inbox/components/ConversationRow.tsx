"use client";

import { useRowGestures, type RowAction } from "@/features/app-shell";
import type { Conversation } from "../types";
import { waitLabel, waitLevelClass } from "../api/wait";
import { ChannelIcon } from "./ChannelIcon";

type Props = {
  conversation: Conversation;
  needsReply: boolean;
  selected: boolean;
  visible: boolean;
  time: string;
  snippet: string;
  rowId: string;
  // `byKeyboard` is true when Enter or Space pressed the row (a click with no pointer).
  onOpen: (byKeyboard: boolean) => void;
  // The row's Mark done / Flag for reply (swipe left and the menu), as in the design (logic `uxActs`).
  onToggleNeed: () => void;
};

export function ConversationRow({ conversation: c, needsReply, selected, visible, time, snippet, rowId, onOpen, onToggleNeed }: Props) {
  // Design `uxItems` for a conversation row: "Open conversation", then Mark done or Flag for reply.
  // A swipe right opens it (its strip says "Reply", design `r: { t: 'Reply' }`), a swipe left runs the second one.
  const actions: RowAction[] = [
    { label: "Open conversation", swipeLabel: "Reply", onAction: () => onOpen(false), swipe: "right" },
    { label: needsReply ? "Mark done" : "Flag for reply", onAction: onToggleNeed, swipe: "left" },
  ];
  const gestures = useRowGestures<HTMLButtonElement>({ label: c.name, actions });
  const cls = `fd-cr${needsReply ? " is-need" : ""}${selected ? " is-sel" : ""}${visible ? "" : " is-off"}`;
  return (
    <button type="button" className={cls} aria-current={selected ? "true" : "false"} data-row-id={rowId} {...gestures} onClick={(event) => onOpen(event.detail === 0)}>
      <ChannelIcon channel={c.channel} />
      <span className="fd-crx">
        <span className="fd-cr1">
          <span className="fd-crn">{c.name}</span>
          <span className={`fd-chip ${waitLevelClass(c.minutesWaiting)} fd-crw${needsReply ? "" : " is-off"}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <span><span className="fd-h">{waitLabel(c.minutesWaiting)}</span></span>
          </span>
          <span className={`fd-crt${needsReply ? " is-off" : ""}`}><span className="fd-h">{time}</span></span>
        </span>
        <span className="fd-cr2"><span className="fd-srw">{c.channel}</span><span className="fd-csn"><span className="fd-h">{snippet}</span></span></span>
      </span>
    </button>
  );
}
