import type { CSSProperties } from "react";
import Link from "next/link";
import { money, nobodyOwes, totals } from "../api/payments";
import type { PaymentRow, PaymentsState } from "../types";
import { PaymentRowItem } from "./PaymentRowItem";

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
        {/* Rule 9: the payment processor status has no API yet, so it reads "Not available yet" (as on
            Settings, build-prompt section 5), with no switch. The chip sits inside the text so the
            sentence stays beside the icon, as in the design. */}
        <span>Online payments: <b className="fd-chip is-plain">Not available yet</b> A paid invoice does not mark itself paid yet.</span>
        <Link className="fd-btn" href="/settings?section=connections">Connect in Settings</Link>
      </p>
      <div className="fd-lst fd-in" style={stagger(2)}>
        {rows.map((row) => (
          <PaymentRowItem key={row.id} row={row} state={state} onRemind={onRemind} onPaid={onPaid} onUndo={onUndo} />
        ))}
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
