"use client";

import { useMemo, type CSSProperties } from "react";
import { useBusiness, useBusinessValues, usePushed, useSearchRows } from "@/features/app-shell";
import { businessCard, formatMoney, invoiceSearchRows, totals } from "../api/invoices";
import { useInvoices } from "../hooks/use-invoices";
import type { Filter } from "../types";
import { InvoiceRow } from "./InvoiceRow";
import { InvoiceSheet } from "./InvoiceSheet";

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "todo", label: "To send" },
  { key: "sent", label: "Sent" },
  { key: "paid", label: "Paid" },
];

const step = (i: number) => ({ "--i": i }) as CSSProperties;

// Page content only: the shell renders the `fd-view` wrapper. Phase 2: every number and button
// works on mock data in local state. Nothing is fetched, saved or sent.
export function InvoicesPage() {
  const s = useInvoices();
  usePushed(s.doc);
  // Search finds the invoices as they are now (design: search reads the rendered rows).
  useSearchRows("invoices", useMemo(() => invoiceSearchRows(s.invoices), [s.invoices]));
  // Business facts come from the signed-in sub-account's custom values, never from copy. "" when missing.
  const biz = businessCard(useBusinessValues(), useBusiness().logoUrl ?? null);
  const t = totals(s.invoices, s.now);
  return (
    <div className={`fd-dv${s.doc ? " is-doc" : ""}`}>
      <section className="fd-phd fd-in" style={step(0)}>
        <h1 className="fd-pt">Invoices</h1>
        <p className="fd-pw">
          <span className="fd-wd">An invoice makes itself when you mark a job done. If one thing is missing, you fill in that one thing. Then it goes out with one press.</span>
          <span className="fd-wm">An invoice makes itself when a job is done. Fill in what is missing.</span>
        </p>
      </section>
      <div className="fd-cols fd-in" style={step(1)}>
        <div>
          <section className="fd-sum fd-sumc" aria-label="In numbers">
            <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{String(t.todo)}</span></p><p className="fd-sml">To send</p></div>
            <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{formatMoney(t.owed)}</span></p><p className="fd-sml">Owed to you</p></div>
            <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{formatMoney(t.paid)}</span></p><p className="fd-sml">Paid this month</p></div>
          </section>
          <div className="fd-fl" role="group" aria-label="Which rows show">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={`fd-flb${s.filter === f.key ? " is-on" : ""}`} aria-pressed={s.filter === f.key} onClick={() => s.setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <div className="fx-emp">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>
            <p>No invoices in this view.</p>
            <button type="button" className="fd-btn is-plain" onClick={() => s.setFilter("all")}>Show all invoices</button>
          </div>
          <div className="fd-lst">
            {s.invoices.map((inv) => <InvoiceRow key={inv.no} inv={inv} s={s} />)}
          </div>
        </div>
        <div className="fd-side2">
          <InvoiceSheet s={s} biz={biz} />
        </div>
      </div>
    </div>
  );
}
