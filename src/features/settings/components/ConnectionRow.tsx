import { A2P_UNKNOWN, A2P_VERIFIED, ASKED_NOTE, ASK_LABEL, DONE_WHEN, NO_STATUS_NOTE, connectionChip } from "../api/connections";
import type { Connection, ConnectionStatus } from "../types";
import { ChipIcons } from "./ChipIcons";
import { svgProps } from "./svg-props";

type Props = {
  connection: Connection;
  status: ConnectionStatus;
  // The business phone number, shown before the line under the name (phone row only).
  phone: string;
  // The phone row carries the A2P line when connected.
  a2p: boolean;
  how: boolean;
  asked: boolean;
  onHow: () => void;
  onAsk: () => void;
};

// One connection row. A row known to be not connected shows what you need, the steps, the done-when
// line and the ask button (build prompt section 8, Settings 3). A connected row is collapsed with
// "How it works". A row with no known status shows one line and offers no steps or actions.
export function ConnectionRow({ connection: c, status, phone, a2p, how, asked, onHow, onAsk }: Props) {
  const unknown = status.state === "unknown";
  const on = status.state === "connected";
  const off = status.state === "not-connected";
  const chip = connectionChip(status);
  const open = off || how;
  return (
    <div className="fd-rw">
      <div className="fd-rm">
        <div className="fd-rbx">
          <p className="fd-rn">{c.name}</p>
          <p className="fd-rsb">
            {phone ? <><span className="fd-h">{phone}</span>. </> : null}
            {c.sub}
          </p>
        </div>
      </div>
      <div className="fd-rac">
        <span className={`fd-chip ${chip.ok ? "is-ok" : "is-plain"}`}>
          <ChipIcons />
          <span className="fd-h">{chip.text}</span>
        </span>
        {unknown ? null : (
          <button type="button" className={`fd-btn is-plain${off ? " is-off" : ""}`} aria-expanded={open} onClick={onHow}>
            <span className="fd-h">{how ? "Hide" : "How it works"}</span>
          </button>
        )}
      </div>
      {on && a2p ? (
        <div className="fd-rex fd-trust">
          {status.a2pVerified ? (
            <p className="fd-trh">
              <svg width="15" height="15" {...svgProps} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              {A2P_VERIFIED}
            </p>
          ) : (
            <p className="fd-trh">{A2P_UNKNOWN}</p>
          )}
        </div>
      ) : null}
      {unknown ? (
        <div className="fd-rex">
          <p className="fd-pns fd-hint">{NO_STATUS_NOTE}</p>
        </div>
      ) : (
        <div className={`fd-rex fd-how${open ? "" : " is-off"}`}>
          <p className="fd-hneed"><b>You need:</b> {c.need}</p>
          <ol className="fd-steps">{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="fd-pns fd-hint">{DONE_WHEN}</p>
          {off ? (
            asked ? (
              <p className="fd-pns fd-hint" role="status">{ASKED_NOTE}</p>
            ) : (
              <button type="button" className="fd-btn" onClick={onAsk}>{ASK_LABEL}</button>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
