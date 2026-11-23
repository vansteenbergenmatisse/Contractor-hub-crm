import type { LiveTransactionView } from "../types";

// One payment on record. Read-only: it has no controls.
export function LiveTransactionRowItem({ row }: { row: LiveTransactionView }) {
  return (
    <div className="fd-rw" data-row-id={`transaction-${row.id}`}>
      <div className="fd-rm">
        <div className="fd-rbx">
          <p className="fd-rn"><span className="fd-h">{row.name}</span></p>
          <p className="fd-rsb">{row.dateText}</p>
          <div className="fd-rtg">
            <span className="fd-chip is-plain"><span className="fd-h">{row.statusLabel}</span></span>
            {row.test && <span className="fd-chip is-plain">Test</span>}
            {row.refundText && <span className="fd-chip is-plain"><span className="fd-h">{row.refundText}</span></span>}
          </div>
        </div>
      </div>
      <div className="fd-rac"><span className="fd-ram"><span className="fd-h">{row.amountText}</span></span></div>
    </div>
  );
}
