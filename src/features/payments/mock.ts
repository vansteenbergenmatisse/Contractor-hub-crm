// MOCK DATA (Phase 2). The open invoices of the design. Replaced in Phase 3 by the sub-account's
// open invoices and their reminder history. Never treat any value here as a real fact.
// The invoices themselves (number, name, job, amount, due day) come from the Invoices page's mock
// list, so both pages always show the same due chip for the same invoice. Only the reminder history
// line is this page's own.
import type { SearchRow } from "@/features/app-shell";
import { buildMockInvoices, chipFor, daysLate, initialsOf } from "@/features/invoices";
import type { PaymentRow } from "./types";

// What the reminder history says before anything happens on screen, per invoice number.
const HISTORY: Readonly<Record<number, string>> = {
  1042: "Reminders went out on day 3, 7 and 14",
  1044: "A reminder went out on day 3. The next one goes on day 7.",
  1045: "The first reminder goes 3 days after the due date",
};
const FALLBACK_HISTORY = "The first reminder goes 3 days after the due date";

// The sent (open) invoices, dated from `now`, most late first as in the design.
export function buildMockPayments(now: Date): PaymentRow[] {
  return buildMockInvoices(now)
    .filter((inv) => inv.st === "sent" && inv.dueOn !== null)
    .map((inv) => ({
      id: `inv-${inv.no}`,
      initials: initialsOf(inv.name),
      name: inv.name,
      invoice: `Invoice ${inv.no}`,
      job: inv.svc,
      amount: inv.amt,
      daysLate: inv.dueOn ? daysLate(inv.dueOn, now) : 0,
      when: chipFor(inv, now).text,
      history: HISTORY[inv.no] ?? FALLBACK_HISTORY,
    }))
    .sort((a, b) => b.daysLate - a.daysLate);
}

// Rows the global search finds on this page. Names and jobs do not depend on the day, so a fixed
// day keeps this static (safe on the server layout).
export const searchRows: SearchRow[] = buildMockPayments(new Date(2000, 0, 1)).map((row) => ({
  id: `payments-${row.id}`,
  page: "payments",
  name: row.name,
  sub: `${row.invoice} · ${row.job}`,
  href: "/payments",
}));
