import { chipFor, fixFieldA11y, formatMoney, initialsOf, matchesFilter, missingField } from "../api/invoices";
import { viewButtonId, type InvoicesState } from "../hooks/useInvoices";
import type { Invoice, MissingField } from "../types";
import { StatusChip } from "./StatusChip";

const FIELD: Record<MissingField, { label: string; placeholder?: string; inputMode?: "decimal" }> = {
  price: { label: "Price", placeholder: "For example 950", inputMode: "decimal" },
  addr: { label: "Billing address" },
  name: { label: "Name on the invoice" },
};

function Avatar({ name }: { name: string }) {
  if (name) return <span className="fd-av" aria-hidden="true">{initialsOf(name)}</span>;
  return (
    <span className="fd-av" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" />
        <path d="M5.8 16c.5-1.6 1.7-2.4 3.2-2.4s2.7.8 3.2 2.4M15 10h3.5M15 13.5h3.5" />
      </svg>
    </span>
  );
}

export function InvoiceRow({ inv, s }: { inv: Invoice; s: InvoicesState }) {
  const chip = chipFor(inv, s.now);
  const miss = inv.st === "need" ? missingField(inv) : null;
  const err = s.fixError[inv.no] ?? "";
  const a11y = fixFieldA11y(inv.no, err);
  const cls = `fd-rw${matchesFilter(s.filter, inv.st) ? "" : " is-off"}${s.selected?.no === inv.no ? " is-sel" : ""}`;
  return (
    <div className={cls} id={`fd-iv-r${inv.no}`} data-row-id={`invoice-${inv.no}`}>
      <div className="fd-rm">
        <Avatar name={inv.name} />
        <div className="fd-rbx">
          <p className="fd-rn"><span className="fd-h">{inv.name || "No name yet"}</span></p>
          <p className="fd-rsb">{`Invoice ${inv.no} · `}<span className="fd-h">{inv.svc}</span></p>
          <div className="fd-rtg"><StatusChip chip={chip} /></div>
        </div>
      </div>
      <div className="fd-rac">
        <span className="fd-ram"><span className="fd-h">{inv.amt ? formatMoney(inv.amt) : "No price yet"}</span></span>
        <button type="button" className="fd-btn is-plain" id={viewButtonId(inv.no)} onClick={() => s.view(inv.no)}>View</button>
        <button type="button" className={`fd-btn${s.isFirstReady(inv.no) ? " is-fill" : ""}${inv.st === "ready" ? "" : " is-off"}`} onClick={() => s.send(inv.no)}>Send invoice</button>
        <button type="button" className={`fd-btn${inv.st === "sent" ? "" : " is-off"}`} onClick={() => s.paid(inv.no)}>Mark paid</button>
      </div>
      {miss ? (
        <div className="fd-rex fd-ivn">
          <div className="fd-ivf">
            <label className="fd-ll" htmlFor={a11y.id}>{FIELD[miss].label}</label>
            <input
              className="fd-lin"
              id={a11y.id}
              type="text"
              inputMode={FIELD[miss].inputMode}
              autoComplete="off"
              placeholder={FIELD[miss].placeholder}
              value={s.fixText[inv.no] ?? ""}
              aria-invalid={a11y["aria-invalid"]}
              aria-describedby={a11y["aria-describedby"]}
              onChange={(e) => s.setFixText(inv.no, e.target.value)}
            />
          </div>
          <button type="button" className="fd-btn" onClick={() => s.make(inv.no)}>Make invoice</button>
          <p className={`fd-lerr${err ? "" : " is-off"}`} id={a11y.errorId} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
            <span><span className="fd-h">{err}</span></span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
