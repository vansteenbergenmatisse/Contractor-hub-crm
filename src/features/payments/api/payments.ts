import type { Lateness, PaymentRow, PaymentsAction, PaymentsState, Totals } from "../types";

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
  if (action.type === "remind") return remind(state, action.id);
  if (action.type === "paid") return state[action.id]?.paid ? state : markPaid(state, action.id);
  return undo(state, action.id);
}

export function totals(rows: readonly PaymentRow[], state: PaymentsState): Totals {
  const t: Totals = { owed: 0, late: 0, lateCount: 0, got: 0 };
  for (const row of rows) {
    if (state[row.id]?.paid) {
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
  if (s?.paid) return ["Reminders stopped"];
  return [s?.reminded ? "Reminder sent just now" : row.history];
}

export const chipText = (row: PaymentRow, state: PaymentsState): string => (state[row.id]?.paid ? "Paid just now" : row.when);

export const nobodyOwes = (rows: readonly PaymentRow[], state: PaymentsState): boolean => totals(rows, state).owed === 0;
