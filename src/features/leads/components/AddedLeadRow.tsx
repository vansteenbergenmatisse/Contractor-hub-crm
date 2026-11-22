import type { AddedLead } from "../types";
import { ChannelIcon } from "./ChannelIcon";

// A lead added by hand. It has just arrived, so it waits under 1 hour.
export function AddedLeadRow({ lead }: { lead: AddedLead }) {
  return (
    <div className="fd-rw is-new" data-row-id={lead.id}>
      <div className="fd-rm">
        <span className="fd-cht is-you" aria-hidden="true"><ChannelIcon name="you" /></span>
        <div className="fd-rbx">
          <p className="fd-rl1">
            <span className="fd-rn">{lead.name}</span>
            <span className="fd-chip is-warn"><ChannelIcon name="clock" size={13} strokeWidth={2.2} />Call back · just now</span>
          </p>
          <p className="fd-rsb"><b className="fd-srw">Added by you</b><span>{lead.sub}</span></p>
        </div>
      </div>
    </div>
  );
}
