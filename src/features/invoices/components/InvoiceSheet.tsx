import { joinParts } from "@/shared/lib/join-parts";
import { sheetFor } from "../api/invoices";
import type { InvoicesState } from "../hooks/useInvoices";
import type { BusinessCard } from "../types";

const ALERT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" />
  </svg>
);

// The invoice the customer gets. Beside the list on a computer, a pushed detail on a phone.
export function InvoiceSheet({ s, biz }: { s: InvoicesState; biz: BusinessCard }) {
  const inv = s.selected;
  if (!inv) return null;
  const v = sheetFor(inv, s.now);
  const { editing, form, setForm } = s;
  const canSend = inv.st === "ready" && !editing;
  return (
    <section className="fd-pnl fd-doc" aria-label="The invoice the customer gets" aria-live="polite">
      <button type="button" className="fd-link fd-aback" onClick={s.shut}>
        <svg className="fd-flip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>
        Back to the list
      </button>
      <div className="fd-dchd">
        <p className="fd-dcl fd-dct">What the customer gets, in short</p>
        <button type="button" className={`fd-link fd-shed${editing || inv.st === "paid" ? " is-off" : ""}`} onClick={s.startEdit}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
          Edit
        </button>
      </div>
      <div className={`fd-sheet${editing ? " is-off" : ""}`}>
        <div className="fd-dch">
          <span className="fd-logo" aria-hidden="true"><span className="fd-h">{biz.init}</span></span>
          <div>
            {biz.name ? <p className="fd-dcb"><span className="fd-h">{biz.name}</span></p> : null}
            {biz.addr ? <p className="fd-dcs"><span className="fd-h">{biz.addr}</span></p> : null}
            {joinParts([biz.phone, biz.email]) ? <p className="fd-dcs"><span className="fd-h">{joinParts([biz.phone, biz.email])}</span></p> : null}
            {joinParts([biz.site, biz.hours]) ? <p className="fd-dcs"><span className="fd-h">{joinParts([biz.site, biz.hours])}</span></p> : null}
          </div>
        </div>
        <p className="fd-dcn">
          <span><span className="fd-h">{v.title}</span></span>
          <span className={`fd-chip ${v.chip.tone}`}><span className="fd-h">{v.chip.text}</span></span>
        </p>
        <p className="fd-dcs"><span className="fd-h">{v.due}</span></p>
        <p className="fd-dcl">Bill to</p>
        <p className="fd-dcv"><span className="fd-h">{v.name}</span></p>
        <p className="fd-dcs"><span className="fd-h">{v.addr}</span></p>
        <ul className="fd-qln">
          <li className="is-line"><span><span className="fd-h">{v.svc}</span></span><b><span className="fd-h">{v.lineAmount}</span></b></li>
          <li className="is-tot"><span>Total due</span><b><span className="fd-h">{v.total}</span></b></li>
        </ul>
        <p className="fd-dcs">Pay online with the link in this message. Thank you for your business.</p>
      </div>
      <div className={`fd-she${editing ? "" : " is-off"}`}>
        <label className="fd-ll" htmlFor="fd-ie-name">Name on the invoice</label>
        <input className="fd-lin" id="fd-ie-name" type="text" autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="fd-ll" htmlFor="fd-ie-addr">Billing address</label>
        <input className="fd-lin" id="fd-ie-addr" type="text" autoComplete="off" value={form.addr} onChange={(e) => setForm({ ...form, addr: e.target.value })} />
        <div className="fd-shl">
          <div className="fd-ivf">
            <label className="fd-ll" htmlFor="fd-ie-t0">Work</label>
            <input className="fd-lin" id="fd-ie-t0" type="text" autoComplete="off" value={form.svc} onChange={(e) => setForm({ ...form, svc: e.target.value })} />
          </div>
          <div className="fd-shp">
            <label className="fd-ll" htmlFor="fd-ie-a0">Price</label>
            <input className="fd-lin" id="fd-ie-a0" type="text" inputMode="decimal" autoComplete="off" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
        </div>
        <p className={`fd-lerr${s.editError ? "" : " is-off"}`} role="alert">
          {ALERT}
          <span><span className="fd-h">{s.editError}</span></span>
        </p>
        <div className="fd-rac fd-pna">
          <button type="button" className="fd-btn" onClick={s.saveEdit}>Save</button>
          <button type="button" className="fd-btn is-plain" onClick={s.cancelEdit}>Cancel</button>
        </div>
      </div>
      <div className="fd-rac fd-pna fd-docact">
        <button type="button" className={`fd-btn is-fill${canSend ? "" : " is-off"}`} onClick={() => s.send(inv.no)}>Send invoice</button>
      </div>
    </section>
  );
}
