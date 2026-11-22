"use client";

import { useMemo } from "react";
import { markPaidPatch, unmarkPaidPatch, useInvoicesKept } from "@/features/invoices";
import { paymentsFromInvoices } from "../api/payments";
import { mockHistory } from "../mock";
import type { PaymentRow } from "../types";

// The rows of Payments due, read from the live Invoices state (the same kept state the Invoices page
// uses), so an invoice sent or paid on Invoices shows here at once, and Mark paid / Undo here show on
// Invoices. Mock data only (Phase 2): nothing is sent or saved.
export function usePaymentRows(now: Date): { rows: PaymentRow[]; markPaid: (no: number) => void; undoPaid: (no: number) => void } {
  const [invoices, dispatch] = useInvoicesKept();
  const list = invoices.invoices;
  const rows = useMemo(() => paymentsFromInvoices(list, now, mockHistory), [list, now]);
  return {
    rows,
    markPaid: (no) => dispatch(markPaidPatch(no, new Date())),
    undoPaid: (no) => dispatch(unmarkPaidPatch(no)),
  };
}
