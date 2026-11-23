import type { LiveInvoiceView } from "../types";
import { InvoiceAvatar } from "./InvoiceAvatar";

// One real invoice. `actions` are the row's disabled controls: nothing on this row can write.
export function LiveInvoiceRowItem({ row, actions, noteId }: { row: LiveInvoiceView; actions: readonly string[]; noteId: string }) {
  return (
    <div className="fd-rw" data-row-id={`invoice-${row.id}`}>
      <div className="fd-rm">
        <InvoiceAvatar name={row.name === "No name" ? "" : row.name} />
        <div className="fd-rbx">
          <p className="fd-rn"><span className="fd-h">{row.name}</span></p>
          <p className="fd-rsb"><span className="fd-h">{row.detail}</span></p>
          <div className="fd-rtg">
            <span className={`fd-chip ${row.tone}`}><span className="fd-h">{row.statusLabel}</span></span>
            {row.test && <span className="fd-chip is-plain">Test</span>}
            {row.dueText && <span className="fd-chip is-plain"><span className="fd-h">{row.dueText}</span></span>}
          </div>
        </div>
      </div>
      <div className="fd-rac">
        <span className="fd-ram"><span className="fd-h">{row.amountText}</span></span>
        {actions.map((label) => (
          <button key={label} type="button" className="fd-btn is-plain" disabled title="Not available yet" aria-describedby={noteId}>{label}</button>
        ))}
      </div>
    </div>
  );
}
