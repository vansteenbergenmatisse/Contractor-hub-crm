// Types shared inside the payments feature.

// One open invoice. `daysLate` is 0 or less when the invoice is not due yet.
export type PaymentRow = {
  id: string;
  initials: string;
  name: string;
  invoice: string;
  job: string;
  amount: number;
  daysLate: number;
  // The due label shown on the chip while the invoice is open ("14 days late", "Due Nov 22"),
  // the same text the Invoices page shows for this invoice.
  when: string;
  // What the reminder history says before anything happens on screen.
  history: string;
};

export type Lateness = "warn" | "bad" | "hot";

// Local, on-screen state per row. Nothing here is sent or saved. One reminder flag per row, as in
// the design: pressing Remind now again changes nothing.
export type RowState = { paid: boolean; reminded: boolean };
export type PaymentsState = Readonly<Record<string, RowState>>;

export type Totals = { owed: number; late: number; lateCount: number; got: number };

// What the page can do to a row.
export type PaymentsAction = { type: "remind" | "paid" | "undo"; id: string };
