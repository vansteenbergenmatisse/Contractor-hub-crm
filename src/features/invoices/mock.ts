// MOCK DATA (Phase 2). The design's sample invoices. Replaced in Phase 3 by the sub-account's
// invoices. Names, addresses and amounts are sample values, never real customers or facts.
import type { SearchRow } from "@/features/app-shell";
import { addDaysIso, invoiceSearchRows, toIsoDay } from "./api/invoices";
import type { Invoice } from "./types";

type Seed = Omit<Invoice, "justNow" | "dueOn" | "paidOn"> & {
  // Sent invoices: the due day, in days from today (negative = late).
  dueInDays?: number;
  // Paid invoices: how many days ago it was paid (kept inside the current month).
  paidAgo?: number;
};

const SEEDS: readonly Seed[] = [
  { no: 1049, name: "Hilliard Storage", svc: "Gutter repair", amt: 1200, addr: "4000 Cemetery Rd, Hilliard", st: "ready", note: "Made when the job was marked done" },
  { no: 1048, name: "Dublin Bakery", svc: "Gutter repair", amt: 0, addr: "63 High St, Dublin", st: "need", note: "" },
  { no: 1047, name: "Marco Ruiz", svc: "Shingle repair", amt: 780, addr: "", st: "need", note: "" },
  { no: 1046, name: "", svc: "Gutter cleaning", amt: 240, addr: "12 Birch Ln, Dublin", st: "need", note: "" },
  { no: 1045, name: "Paul Ortega", svc: "Roof replacement", amt: 9500, addr: "88 Linden Ave, Columbus", st: "sent", note: "", dueInDays: 0 },
  { no: 1044, name: "Grace Whitfield", svc: "Gutter replacement", amt: 4850, addr: "37 Kenny Rd, Columbus", st: "sent", note: "", dueInDays: -6 },
  { no: 1042, name: "Bright Daycare", svc: "Roof repair", amt: 9400, addr: "915 Parsons Ave, Columbus", st: "sent", note: "", dueInDays: -14 },
  { no: 1041, name: "Lena Fox", svc: "Roof repair", amt: 1950, addr: "2210 Neil Ave, Columbus", st: "paid", note: "", paidAgo: 11 },
];

// The sample list, dated from `now` so lateness stays the same whenever the page opens.
export function buildMockInvoices(now: Date): Invoice[] {
  const today = toIsoDay(now);
  return SEEDS.map(({ dueInDays, paidAgo, ...rest }) => ({
    ...rest,
    justNow: false,
    dueOn: dueInDays === undefined ? null : addDaysIso(today, dueInDays),
    // Never reach into last month: "Paid this month" counts this month only.
    paidOn: paidAgo === undefined ? null : addDaysIso(today, -Math.min(paidAgo, now.getDate() - 1)),
  }));
}

// What the global search can find on this page before it has opened. Static: no dates, so safe on the server layout.
export const searchRows: SearchRow[] = invoiceSearchRows(SEEDS);
