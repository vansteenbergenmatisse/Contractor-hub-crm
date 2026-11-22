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
  // The due label shown on the chip while the invoice is open ("14 days late", "Due Nov 20").
  when: string;
  // What the reminder history says before anything happens on screen.
  history: string;
};

export type Lateness = "warn" | "bad" | "hot";

// Local, on-screen state per row. Nothing here is sent or saved.
export type RowState = { paid: boolean; reminders: number };
export type PaymentsState = Readonly<Record<string, RowState>>;

export type Totals = { owed: number; late: number; lateCount: number; got: number };
