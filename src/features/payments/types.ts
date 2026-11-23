// Types shared inside the payments feature.
import type { DueTotal, LiveInvoiceView } from "@/features/invoices";

// One open invoice. `daysLate` is 0 or less when the invoice is not due yet.
export type PaymentRow = {
  id: string;
  // The invoice number (the Invoices page's key).
  no: number;
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
  // Marked paid during this visit (here or on the Invoices page): shown paid, with Undo.
  settled?: boolean;
};

export type Lateness = "warn" | "bad" | "hot";

// Local, on-screen state per row. Nothing here is sent or saved. One reminder flag per row, as in
// the design: pressing Remind now again changes nothing.
export type RowState = { paid: boolean; reminded: boolean };
export type PaymentsState = Readonly<Record<string, RowState>>;

export type Totals = { owed: number; late: number; lateCount: number; got: number };

// What the page can do to a row.
// "track" adds a state entry for rows that appear later (an invoice sent on the Invoices page).
export type PaymentsAction = { type: "remind" | "paid" | "undo"; id: string } | { type: "track"; ids: readonly string[] };

// What a row's swipe and menu can do (design uxActs / uxItems).
export type RowActionSpec = { label: string; key: "remind" | "paid" | "undo"; swipe?: "right" | "left" };

// Real payment records (read-only). The shape the adapter hands over; declared here so this feature
// does not depend on it (the server page injects the readers). An unreadable field is null.
export type LiveTransactionRow = {
  id: string;
  contactName: string | null;
  currency: string | null;
  amount: number | null;
  amountRefunded: number | null;
  status: string | null;
  liveMode: boolean | null;
  createdAt: string | null;
};
export type TransactionsRead =
  | { ok: true; rows: LiveTransactionRow[]; expected: number; dropped: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" };
export type TransactionsReader = (tenantId: string, signal?: AbortSignal) => Promise<TransactionsRead>;
export type LiveTransactionView = {
  id: string;
  name: string;
  statusLabel: string;
  amountText: string;
  refundText: string | null;
  dateText: string;
  test: boolean;
};
export type PaymentsResult =
  | { state: "reconnect" | "unavailable" | "empty" }
  | {
      state: "ready";
      due: LiveInvoiceView[];
      total: DueTotal | null;
      blocked: boolean;
      complete: boolean;
      transactions: { rows: LiveTransactionView[]; complete: boolean } | null;
    };
