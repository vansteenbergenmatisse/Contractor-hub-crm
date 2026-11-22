import { MOCK_OLD_LEADS } from "../mock";
import type { OldState } from "../types";

type Props = { old: OldState; auto: boolean; onAsk: () => void; onYes: () => void; onNo: () => void; onToggleAuto: () => void };

// Leads with no contact in 3 months. Phase 2: both buttons only change what the screen says.
// Nothing is sent and no workflow is created. In Phase 3 "Make it automatic" creates a HighLevel
// workflow; this app holds no automation of its own.
export function OldLeadsPanel({ old, auto, onAsk, onYes, onNo, onToggleAuto }: Props) {
  const text =
    old === "sent" ? `Sent. ${MOCK_OLD_LEADS} people got a check-in text. Their answers land in your Inbox.`
    : old === "ask" ? `This texts ${MOCK_OLD_LEADS} people at once. You can not take it back.`
    : "Nobody called or texted them in the last 3 months. One press sends each one a friendly check-in text.";
  return (
    <section className="fd-pnl fd-old" aria-labelledby="fd-ld-o">
      <h2 className="fd-pnh" id="fd-ld-o">{MOCK_OLD_LEADS} leads with no contact in 3 months</h2>
      <p className="fd-pns" role="status">{text}</p>
      <div className="fd-rac fd-pna">
        {old === "idle" && <button type="button" className="fd-btn" onClick={onAsk}>Text them a check-in</button>}
        {old === "ask" && <button type="button" className="fd-btn is-fill" onClick={onYes}>Send to {MOCK_OLD_LEADS} people</button>}
        {old === "ask" && <button type="button" className="fd-btn is-plain" onClick={onNo}>Cancel</button>}
      </div>
      <div className="fd-oau">
        <p className={`fd-oat${auto ? " is-on" : ""}`}>
          {auto ? "On. A lead with no contact for 3 months gets one check-in text by itself." : "Or let it run by itself, so nobody goes cold again."}
        </p>
        <button type="button" className="fd-btn is-plain" onClick={onToggleAuto}>{auto ? "Turn it off" : "Make it automatic"}</button>
      </div>
    </section>
  );
}
