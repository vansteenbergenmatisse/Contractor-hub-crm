"use client";

import { useId } from "react";
import { LiveInvoiceRowItem, blockedNote, formatLiveAmount } from "@/features/invoices";
import type { PaymentsResult } from "../types";
import { LiveTransactionRowItem } from "./LiveTransactionRow";
import { PaymentsStatus } from "./PaymentsStatus";

const ROW_ACTIONS = ["Remind now", "Mark paid"] as const;

// The real Payments due page, read-only. Lateness is not shown: the location's date is not read here.
export function PaymentsLivePage({ result }: { result: PaymentsResult }) {
  const noteId = useId();
  if (result.state !== "ready") return <PaymentsStatus state={result.state} />;
  const { due, total, blocked, blockedBy, complete, transactions } = result;
  return (
    <>
      <section className="fd-phd fd-in">
        <h1 className="fd-pt">Payments due</h1>
        <p className="fd-pw" id={noteId}>View only. Reminders and marking paid are not available here yet. Amounts are shown as your CRM reports them.</p>
      </section>
      {total && (
        <section className="fd-sum fd-in" aria-label="In numbers">
          <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{formatLiveAmount(total.amount, total.currency)}</span></p><p className="fd-sml">Owed to you</p></div>
          <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{String(total.count)}</span></p><p className="fd-sml">Open invoices</p></div>
        </section>
      )}
      {blocked && (
        <p className="fd-ppb is-warn" role="status">
          <span>{blockedNote(complete, blockedBy)}</span>
        </p>
      )}
      <div className="fd-lst fd-in">
        {due.map((row) => <LiveInvoiceRowItem key={row.id} row={row} actions={ROW_ACTIONS} noteId={noteId} />)}
        {due.length === 0 && !blocked && <p className="fd-none">Nobody owes you money.</p>}
      </div>
      <section className="fd-in" aria-labelledby={`${noteId}-history`}>
        <h2 className="fd-pnh" id={`${noteId}-history`}>Payments on record</h2>
        {transactions === null && <p className="fd-ppb is-warn" role="status"><span>Payment records can&apos;t load right now.</span></p>}
        {transactions && !transactions.complete && <p className="fd-ppb is-warn" role="status"><span>Not every payment could be read.</span></p>}
        {transactions && (
          <div className="fd-lst">
            {transactions.rows.map((row) => <LiveTransactionRowItem key={row.id} row={row} />)}
            {transactions.rows.length === 0 && transactions.complete && <p className="fd-none">No payments on record.</p>}
          </div>
        )}
      </section>
    </>
  );
}
