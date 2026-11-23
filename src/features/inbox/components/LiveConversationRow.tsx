import type { LiveConversation } from "../types";
import { ChannelIcon } from "./ChannelIcon";

// One real conversation. Opening it is the only action: nothing here marks it read or changes it.
export function LiveConversationRow({ conversation: c, selected, onOpen }: { conversation: LiveConversation; selected: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`fd-cr${selected ? " is-sel" : ""}`} aria-current={selected ? "true" : "false"} data-row-id={`inbox-${c.id}`} onClick={onOpen}>
      {c.channel ? <ChannelIcon channel={c.channel} /> : <span className="fd-cht" aria-hidden="true" />}
      <span className="fd-crx">
        <span className="fd-cr1">
          <span className="fd-crn">{c.name}</span>
          {c.unreadCount > 0 && <span className="fd-chip is-warn fd-crw"><span className="fd-h">{c.unreadCount} unread</span></span>}
        </span>
        <span className="fd-cr2"><span className="fd-srw">{c.channel ?? "Message"}</span><span className="fd-csn"><span className="fd-h">{c.snippet}</span></span></span>
      </span>
    </button>
  );
}
