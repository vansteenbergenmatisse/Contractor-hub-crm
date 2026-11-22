"use client";

import { useEffect, useMemo, useState } from "react";
import { useKeptReducer, useRowFocus, useSearchRows, useUndoShortcut } from "@/features/app-shell";
import { initialState, liveState, paymentsReducer } from "../api/payments";
import { usePaymentRows } from "../hooks/use-payment-rows";
import { paymentSearchRows } from "../mock";
import type { PaymentRow } from "../types";
import { PaymentsView } from "./PaymentsView";

// Payments due, on mock data. Nothing is sent, saved or fetched. The rows are the open invoices of
// the Invoices page's live state, so both pages show one state: Mark paid and Undo here change the
// invoice there too. This page keeps only its reminder flags (the shell's page store), as in the design.
export function PaymentsPage() {
  const [now] = useState(() => new Date());
  const { rows, markPaid, undoPaid } = usePaymentRows(now);
  const [kept, dispatch] = useKeptReducer("payments", paymentsReducer, rows, (r: readonly PaymentRow[]) => initialState(r));
  const state = useMemo(() => liveState(rows, kept), [rows, kept]);
  // An invoice sent on the Invoices page after the first visit gets its own reminder flag here.
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  useEffect(() => {
    dispatch({ type: "track", ids });
  }, [ids, dispatch]);
  useRowFocus(useMemo(() => ids.map((id) => `payments-${id}`), [ids]));
  // Search finds the rows this page shows now (an invoice sent on Invoices included).
  useSearchRows("payments", useMemo(() => paymentSearchRows(rows), [rows]));
  const noOf = (id: string) => rows.find((row) => row.id === id)?.no;
  const onPaid = (id: string) => {
    const no = noOf(id);
    if (no !== undefined) markPaid(no);
  };
  const onUndo = (id: string) => {
    const no = noOf(id);
    if (no !== undefined) undoPaid(no);
  };
  // ⌘Z (Ctrl Z) runs the first Undo shown on the page, as the design does. Undo shows only on a paid
  // row, so nothing is registered while no row is paid.
  const undoable = rows.find((row) => row.settled);
  useUndoShortcut(undoable ? () => undoPaid(undoable.no) : null);
  return <PaymentsView rows={rows} state={state} onRemind={(id) => dispatch({ type: "remind", id })} onPaid={onPaid} onUndo={onUndo} />;
}
