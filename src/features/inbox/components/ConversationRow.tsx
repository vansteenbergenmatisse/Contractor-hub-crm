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
  onOpen: () => void;
};

export function ConversationRow({ conversation: c, needsReply, selected, visible, time, snippet, onOpen }: Props) {
  const cls = `fd-cr${needsReply ? " is-need" : ""}${selected ? " is-sel" : ""}${visible ? "" : " is-off"}`;
  return (
    <button type="button" className={cls} aria-current={selected ? "true" : "false"} onClick={onOpen}>
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
