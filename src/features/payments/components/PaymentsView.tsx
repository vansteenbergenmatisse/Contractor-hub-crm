import type { CSSProperties } from "react";
import Link from "next/link";
import { canUndo, chipText, historyLines, lateness, money, nobodyOwes, totals } from "../api/payments";
import type { PaymentRow, PaymentsState } from "../types";

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

type Props = {
  rows: readonly PaymentRow[];
  state: PaymentsState;
  onRemind: (id: string) => void;
  onPaid: (id: string) => void;
  onUndo: (id: string) => void;
};

// The page content of Payments due (no view wrapper). Pure: the state comes in as props.
export function PaymentsView({ rows, state, onRemind, onPaid, onUndo }: Props) {
  const t = totals(rows, state);
  return (
    <>
      <section className="fd-phd fd-in" style={stagger(0)}>
        <h1 className="fd-pt">Payments due</h1>
        <p className="fd-pw">
          <span className="fd-wd">Who owes you money and how late they are. The system reminds them for you. You call the ones that stay quiet.</span>
          <span className="fd-wm">Who owes you money and how late they are.</span>
        </p>
      </section>
      <section className="fd-sum fd-in" style={stagger(1)} aria-label="In numbers">
        <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{money(t.owed)}</span></p><p className="fd-sml">Owed to you</p></div>
        <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{money(t.late)}</span></p><p className="fd-sml"><span className="fd-h">{t.lateCount} late</span></p></div>
        <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{money(t.got)}</span></p><p className="fd-sml">Paid today</p></div>
      </section>
      <p className="fd-ppb is-warn" role="status">
        <svg {...svg} width={16} height={16} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
        {/* Rule 9: a feature the system does not have shows a "Not available yet" chip and no switch. */}
        <b className="fd-chip is-plain">Not available yet</b>
        <span>Online payments are not connected. A paid invoice does not mark itself paid yet.</span>
        <Link className="fd-btn" href="/settings?section=connections">Connect in Settings</Link>
      </p>
      <div className="fd-lst fd-in" style={stagger(2)}>
        {rows.map((row) => {
          const paid = !!state[row.id]?.paid;
          return (
            <div key={row.id} className={`fd-rw${paid ? " is-done" : ""}`} data-row-id={`payments-${row.id}`}>
              <div className="fd-rm">
                <span className="fd-av" aria-hidden="true">{row.initials}</span>
                <div className="fd-rbx">
                  <p className="fd-rn">{row.name}</p>
                  <p className="fd-rsb">{row.invoice} · {row.job}</p>
                  <div className="fd-rtg">
                    <span className={`fd-chip ${paid ? "is-ok" : `is-${lateness(row.daysLate)}`}`}>
                      <svg className="i-w" {...svg} width={13} height={13} strokeWidth={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                      <svg className="i-b" {...svg} width={13} height={13} strokeWidth={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
                      <svg className="i-o" {...svg} width={13} height={13} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                      <span className="fd-h">{chipText(row, state)}</span>
                    </span>
                    {canUndo(state, row.id) && (
                      <button type="button" className="fd-link" onClick={() => onUndo(row.id)} aria-label={`Undo for ${row.name}`}>Undo</button>
                    )}
                  </div>
                  <div aria-live="polite">
                    {historyLines(row, state).map((line, i) => (
                      <p key={i} className="fd-rz">
                        <svg {...svg} width={13} height={13} strokeWidth={2}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
                        <span><span className="fd-h">{line}</span></span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              <div className="fd-rac">
                <span className="fd-ram">{money(row.amount)}</span>
                {!paid && (
                  <>
                    <button type="button" className="fd-btn is-plain" aria-label={`Call ${row.name}`}>
                      <svg {...svg} width={15} height={15} strokeWidth={2}><path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg>
                      Call
                    </button>
                    <button type="button" className="fd-btn is-plain" onClick={() => onRemind(row.id)} aria-label={`Remind now, ${row.name}`}>Remind now</button>
                    <button type="button" className="fd-btn" onClick={() => onPaid(row.id)} aria-label={`Mark paid, ${row.name}`}>Mark paid</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {nobodyOwes(rows, state) && (
          <p className="fd-none">
            <svg {...svg} width={16} height={16} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            Nobody owes you money.
          </p>
        )}
      </div>
    </>
  );
}
