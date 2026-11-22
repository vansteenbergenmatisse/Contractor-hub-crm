"use client";

import { useMemo, useState } from "react";
import { useKeptReducer, useRowFocus, useUndoShortcut } from "@/features/app-shell";
import { canUndo, initialState, paymentsReducer } from "../api/payments";
import { buildMockPayments } from "../mock";
import type { PaymentRow } from "../types";
import { PaymentsView } from "./PaymentsView";

// Payments due, on mock data. Nothing is sent, saved or fetched. The on-screen state is kept while
// the owner moves between pages (the shell's page store), as in the design.
export function PaymentsPage() {
  const [now] = useState(() => new Date());
  const rows = useMemo(() => buildMockPayments(now), [now]);
  const [state, dispatch] = useKeptReducer("payments", paymentsReducer, rows, (r: readonly PaymentRow[]) => initialState(r));
  useRowFocus(useMemo(() => rows.map((row) => `payments-${row.id}`), [rows]));
  // ⌘Z (Ctrl Z) runs the first Undo shown on the page, as the design does. Undo shows only on a paid
  // row, so nothing is registered while no row is paid.
  const undoable = rows.find((row) => canUndo(state, row.id));
  useUndoShortcut(undoable ? () => dispatch({ type: "undo", id: undoable.id }) : null);
  return (
    <PaymentsView
      rows={rows}
      state={state}
      onRemind={(id) => dispatch({ type: "remind", id })}
      onPaid={(id) => dispatch({ type: "paid", id })}
      onUndo={(id) => dispatch({ type: "undo", id })}
    />
  );
}
