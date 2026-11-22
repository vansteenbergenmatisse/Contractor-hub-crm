import { chipFor, daysLate, initialsOf, type Invoice } from "@/features/invoices";
import type { Lateness, PaymentRow, PaymentsAction, PaymentsState, RowActionSpec, Totals } from "../types";

// The open invoices of the Invoices page, as this page lists them: every sent invoice, plus one paid
// during this visit, here or on Invoices (shown paid, "settled"). Most late first, as in the design.
// The due chip is the Invoices page's own; a just-sent invoice shows its due day, not "Sent just now".
export function paymentsFromInvoices(invoices: readonly Invoice[], now: Date, historyOf: (no: number) => string): PaymentRow[] {
  return invoices
    .filter((inv) => (inv.st === "sent" && inv.dueOn !== null) || (inv.st === "paid" && inv.justNow && inv.dueOn !== null))
    .map((inv) => {
      const open: Invoice = { ...inv, st: "sent", justNow: false };
      const row: PaymentRow = {
        id: `inv-${inv.no}`,
        no: inv.no,
        initials: initialsOf(inv.name),
        name: inv.name,
        invoice: `Invoice ${inv.no}`,
        job: inv.svc,
        amount: inv.amt,
        daysLate: inv.dueOn ? daysLate(inv.dueOn, now) : 0,
        when: chipFor(open, now).text,
        history: historyOf(inv.no),
      };
      return inv.st === "paid" ? { ...row, settled: true } : row;
    })
    .sort((a, b) => b.daysLate - a.daysLate);
}

// Amber: not due yet. Light red: late. Full red: more than 7 days late.
export function lateness(daysLate: number): Lateness {
  if (daysLate > 7) return "hot";
  if (daysLate > 0) return "bad";
  return "warn";
}

export function money(n: number): string {
  return `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function initialState(rows: readonly PaymentRow[]): PaymentsState {
  return Object.fromEntries(rows.map((row) => [row.id, { paid: false, reminded: false }]));
}

const patch = (state: PaymentsState, id: string, change: Partial<PaymentsState[string]>): PaymentsState =>
  state[id] ? { ...state, [id]: { ...state[id], ...change } } : state;

// Mark paid closes the invoice. Undo brings it back.
export const markPaid = (state: PaymentsState, id: string) => patch(state, id, { paid: true });
export const undoPaid = (state: PaymentsState, id: string) => patch(state, id, { paid: false });

// Remind now replaces the history line with "Reminder sent just now" (design wording, the owner's
// choice for Phase 2). It sends nothing; in Phase 3 the same button starts the reminder workflow in
// the CRM. One flag per row: pressing again changes nothing. A paid invoice takes no reminder.
export function remind(state: PaymentsState, id: string): PaymentsState {
  const row = state[id];
  return row && !row.paid && !row.reminded ? patch(state, id, { reminded: true }) : state;
}

// Undo is offered only for a paid row, as in the design. It brings the invoice back.
export const canUndo = (state: PaymentsState, id: string): boolean => !!state[id]?.paid;
export const undo = (state: PaymentsState, id: string): PaymentsState => (canUndo(state, id) ? undoPaid(state, id) : state);

export function paymentsReducer(state: PaymentsState, action: PaymentsAction): PaymentsState {
  if (action.type === "track") {
    const missing = action.ids.filter((id) => !state[id]);
    return missing.length ? { ...state, ...Object.fromEntries(missing.map((id) => [id, { paid: false, reminded: false }])) } : state;
  }
  if (action.type === "remind") return remind(state, action.id);
  if (action.type === "paid") return state[action.id]?.paid ? state : markPaid(state, action.id);
  return undo(state, action.id);
}

export function totals(rows: readonly PaymentRow[], state: PaymentsState): Totals {
  const t: Totals = { owed: 0, late: 0, lateCount: 0, got: 0 };
  for (const row of rows) {
    if (isPaid(row, state)) {
      t.got += row.amount;
      continue;
    }
    t.owed += row.amount;
    if (row.daysLate > 0) {
      t.late += row.amount;
      t.lateCount += 1;
    }
  }
  return t;
}

// The reminder history line of a row (one line, as in the design).
export function historyLines(row: PaymentRow, state: PaymentsState): string[] {
  const s = state[row.id];
  if (isPaid(row, state)) return ["Reminders stopped"];
  return [s?.reminded ? "Reminder sent just now" : row.history];
}

// The on-screen state the page shows: the reminder flags it keeps, and "paid" read from the live
// invoices (a row paid during this visit, here or on Invoices).
export function liveState(rows: readonly PaymentRow[], kept: PaymentsState): PaymentsState {
  return Object.fromEntries(rows.map((row) => [row.id, { reminded: !!kept[row.id]?.reminded, paid: !!row.settled }]));
}

// Paid during this visit.
export const isPaid = (row: PaymentRow, state: PaymentsState): boolean => !!row.settled || !!state[row.id]?.paid;

export const chipText = (row: PaymentRow, state: PaymentsState): string => (isPaid(row, state) ? "Paid just now" : row.when);

// The design reads a row's swipe and menu off its visible buttons (Call is left out, data-fx-noact):
// an open invoice has Remind now (swipe right, the row's main button) and Mark paid (swipe left); a
// paid row has only Undo, and no swipe.
export function rowActionSpecs(row: PaymentRow, state: PaymentsState): RowActionSpec[] {
  if (isPaid(row, state)) return [{ label: "Undo", key: "undo" }];
  return [
    { label: "Remind now", key: "remind", swipe: "right" },
    { label: "Mark paid", key: "paid", swipe: "left" },
  ];
}

export const nobodyOwes = (rows: readonly PaymentRow[], state: PaymentsState): boolean => totals(rows, state).owed === 0;
