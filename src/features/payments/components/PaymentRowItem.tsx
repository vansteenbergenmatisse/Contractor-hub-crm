"use client";

import { useRowGestures, type RowAction } from "@/features/app-shell";
import { chipText, historyLines, isPaid, lateness, money, rowActionSpecs } from "../api/payments";
import type { PaymentRow, PaymentsState } from "../types";

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

type Props = {
  row: PaymentRow;
  state: PaymentsState;
  onRemind: (id: string) => void;
  onPaid: (id: string) => void;
  onUndo: (id: string) => void;
};

// One open invoice. Swipe right sends a reminder, swipe left marks it paid; a long press, right-click
// or the menu key opens the row menu (design uxActs / uxItems). The buttons stay on the row.
export function PaymentRowItem({ row, state, onRemind, onPaid, onUndo }: Props) {
  const paid = isPaid(row, state);
  const run = { remind: onRemind, paid: onPaid, undo: onUndo };
  const actions: RowAction[] = rowActionSpecs(row, state).map(({ key, ...spec }) => ({ ...spec, onAction: () => run[key](row.id) }));
  const gestures = useRowGestures<HTMLDivElement>({ label: row.name, actions });
  return (
    <div {...gestures} className={`fd-rw${paid ? " is-done" : ""}`} data-row-id={`payments-${row.id}`}>
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
            {paid && (
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
}
