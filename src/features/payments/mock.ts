// MOCK DATA (Phase 2). Sample open invoices from the design. Replaced in Phase 3 by the
// sub-account's open invoices and their reminder history. Never treat any value here as a real fact.
import type { SearchRow } from "@/features/app-shell";
import type { PaymentRow } from "./types";

export const MOCK_PAYMENTS: readonly PaymentRow[] = [
  { id: "inv-1042", initials: "BD", name: "Bright Daycare", invoice: "Invoice 1042", job: "Roof repair", amount: 9400, daysLate: 14, when: "14 days late", history: "Reminders went out on day 3, 7 and 14" },
  { id: "inv-1044", initials: "GW", name: "Grace Whitfield", invoice: "Invoice 1044", job: "Gutter replacement", amount: 4850, daysLate: 6, when: "6 days late", history: "A reminder went out on day 3. The next one goes on day 7." },
  { id: "inv-1045", initials: "PO", name: "Paul Ortega", invoice: "Invoice 1045", job: "Roof replacement", amount: 9500, daysLate: 0, when: "Due Nov 20", history: "The first reminder goes 3 days after the due date" },
];

// Rows the global search finds on this page.
export const searchRows: SearchRow[] = MOCK_PAYMENTS.map((row) => ({
  id: `payments-${row.id}`,
  page: "payments",
  name: row.name,
  sub: `${row.invoice} · ${row.job}`,
  href: "/payments",
}));
