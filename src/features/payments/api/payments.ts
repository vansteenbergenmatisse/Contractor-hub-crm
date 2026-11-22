import type { Lateness, PaymentRow, PaymentsState, Totals } from "../types";

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
  return Object.fromEntries(rows.map((row) => [row.id, { paid: false, reminders: 0 }]));
}

const patch = (state: PaymentsState, id: string, change: Partial<PaymentsState[string]>): PaymentsState =>
  state[id] ? { ...state, [id]: { ...state[id], ...change } } : state;

// Mark paid closes the invoice. Undo brings it back.
export const markPaid = (state: PaymentsState, id: string) => patch(state, id, { paid: true });
export const undoPaid = (state: PaymentsState, id: string) => patch(state, id, { paid: false });

// Remind now only adds a line to the history on screen. It sends nothing. In Phase 3 the same
// button starts the reminder workflow in the CRM. A paid invoice takes no reminder.
export function remind(state: PaymentsState, id: string): PaymentsState {
  const row = state[id];
  return row && !row.paid ? patch(state, id, { reminders: row.reminders + 1 }) : state;
}

export function undoRemind(state: PaymentsState, id: string): PaymentsState {
  const row = state[id];
  return row && !row.paid && row.reminders > 0 ? patch(state, id, { reminders: row.reminders - 1 }) : state;
}

// The one Undo link on a row brings back a paid invoice, else removes the last reminder line.
export const canUndo = (state: PaymentsState, id: string): boolean => !!state[id] && (state[id].paid || state[id].reminders > 0);
export const undo = (state: PaymentsState, id: string): PaymentsState => (state[id]?.paid ? undoPaid(state, id) : undoRemind(state, id));

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

// The reminder history lines of a row, oldest first.
export function historyLines(row: PaymentRow, state: PaymentsState): string[] {
  const s = state[row.id];
  if (s?.paid) return ["Reminders stopped"];
  return [row.history, ...Array.from({ length: s?.reminders ?? 0 }, () => "Reminder sent just now")];
}

export const chipText = (row: PaymentRow, state: PaymentsState): string => (state[row.id]?.paid ? "Paid just now" : row.when);

export const nobodyOwes = (rows: readonly PaymentRow[], state: PaymentsState): boolean => totals(rows, state).owed === 0;
