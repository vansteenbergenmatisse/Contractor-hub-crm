"use client";

import { useId, useState } from "react";
import { formatLiveAmount } from "../api/load-invoices";
import type { InvoicesResult, LiveInvoiceView } from "../types";
import { InvoicesStatus } from "./InvoicesStatus";
import { LiveInvoiceRowItem } from "./LiveInvoiceRow";

type LiveFilter = "all" | LiveInvoiceView["bucket"];
const FILTERS: ReadonlyArray<{ key: LiveFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "paid", label: "Paid" },
];
const ROW_ACTIONS = ["Send invoice", "Mark paid"] as const;

// The real Invoices page, read-only. Filters change the view on screen and nothing else.
export function InvoicesLivePage({ result }: { result: InvoicesResult }) {
  const [filter, setFilter] = useState<LiveFilter>("all");
  const noteId = useId();
  if (result.state !== "ready") return <InvoicesStatus state={result.state} />;
  const rows = filter === "all" ? result.rows : result.rows.filter((row) => row.bucket === filter);
  return (
    <div className="fd-dv">
      <section className="fd-phd fd-in">
        <h1 className="fd-pt">Invoices</h1>
        <p className="fd-pw" id={noteId}>View only. Sending and marking paid are not available here yet. Amounts are shown as your CRM reports them.</p>
      </section>
      {result.total && (
        <section className="fd-sum fd-sumc fd-in" aria-label="In numbers">
          <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{formatLiveAmount(result.total.amount, result.total.currency)}</span></p><p className="fd-sml">Owed to you</p></div>
          <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{String(result.total.count)}</span></p><p className="fd-sml">Open invoices</p></div>
        </section>
      )}
      {result.blocked && (
        <p className="fd-ppb is-warn" role="status">
          <span>{result.complete ? "Some invoices could not be read in full, so no total is shown." : "Not every invoice could be read, so no total is shown."}</span>
        </p>
      )}
      <div className="fd-fl" role="group" aria-label="Which rows show">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`fd-flb${filter === f.key ? " is-on" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="fd-lst fd-in">
        {rows.map((row) => <LiveInvoiceRowItem key={row.id} row={row} actions={ROW_ACTIONS} noteId={noteId} />)}
        {rows.length === 0 && <p className="fd-none">No invoices in this view.</p>}
      </div>
    </div>
  );
}
