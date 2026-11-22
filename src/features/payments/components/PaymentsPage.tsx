"use client";

import { useState } from "react";
import { initialState, markPaid, remind, undo } from "../api/payments";
import { MOCK_PAYMENTS } from "../mock";
import type { PaymentsState } from "../types";
import { PaymentsView } from "./PaymentsView";

// Payments due, on mock data. All state is local: nothing is sent, saved or fetched.
export function PaymentsPage() {
  const [state, setState] = useState<PaymentsState>(() => initialState(MOCK_PAYMENTS));
  return (
    <PaymentsView
      rows={MOCK_PAYMENTS}
      state={state}
      onRemind={(id) => setState((s) => remind(s, id))}
      onPaid={(id) => setState((s) => markPaid(s, id))}
      onUndo={(id) => setState((s) => undo(s, id))}
    />
  );
}
