import type { SearchRow, SendTimerRequest } from "@/features/app-shell";
import type {
  BusinessCard,
  BusinessValues,
  Chip,
  EditForm,
  Filter,
  Invoice,
  InvoiceStatus,
  MissingField,
  Result,
  SheetView,
} from "../types";

// Placeholder due term (build prompt section 12: 7 days is not decided). One place to change it.
export const INVOICE_DUE_DAYS = 7;

// "Full red" lateness: more than this many days late (build prompt section 8). Not the due term above.
export const OVER_WEEK_DAYS = 7;

const PRICE_ERROR = "Enter the price in dollars. For example 950.";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

// ---- money ----------------------------------------------------------------------------------
export const formatMoney = (n: number): string => "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// "$1,250.50" -> 1250.5. Anything that is not a positive number gives null.
export function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned || !/^\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---- dates (local calendar days as "YYYY-MM-DD") ---------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
export const toIsoDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parts = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
};
const utcDay = (iso: string): number => Date.UTC(...(([y, m, d]) => [y, m - 1, d] as [number, number, number])(parts(iso)));

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(utcDay(iso) + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Whole days from `from` to `to` (negative when `to` is earlier).
export const daysBetween = (from: string, to: string): number => Math.round((utcDay(to) - utcDay(from)) / DAY_MS);

// Days past the due day. Due today is 0 days late.
export const daysLate = (dueOn: string, now: Date): number => Math.max(0, daysBetween(dueOn, toIsoDay(now)));

export function formatDay(iso: string): string {
  const [, m, d] = parts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

const lateText = (n: number) => `${n} ${n === 1 ? "day" : "days"} late`;

// ---- status flow -----------------------------------------------------------------------------
export function missingField(inv: Pick<Invoice, "name" | "addr" | "amt">): MissingField | null {
  if (!inv.name.trim()) return "name";
  if (!inv.addr.trim()) return "addr";
  if (!(inv.amt > 0)) return "price";
  return null;
}

// A draft is "need" while something is missing and "ready" when complete. Sent and paid stay.
function settle(inv: Invoice): Invoice {
  if (inv.st === "sent" || inv.st === "paid") return inv;
  return { ...inv, st: missingField(inv) ? "need" : "ready" };
}

const FIX_ERROR: Record<MissingField, string> = {
  price: PRICE_ERROR,
  addr: "Enter the billing address.",
  name: "Enter the name for the invoice.",
};

// "Make invoice" on a draft: fill the one missing field.
export function fixMissing(inv: Invoice, raw: string): Result {
  const field = missingField(inv);
  if (!field) return { ok: true, invoice: settle(inv) };
  const text = raw.trim();
  if (field === "price") {
    const n = parsePrice(raw);
    if (n === null) return { ok: false, error: FIX_ERROR.price };
    return { ok: true, invoice: settle({ ...inv, amt: n }) };
  }
  if (!text) return { ok: false, error: FIX_ERROR[field] };
  return { ok: true, invoice: settle(field === "name" ? { ...inv, name: text } : { ...inv, addr: text }) };
}

// Edit on the sheet: name, address, the work and the price.
export function editInvoice(inv: Invoice, form: EditForm): Result {
  const svc = form.svc.trim();
  if (!svc) return { ok: false, error: "Say what the work was." };
  const rawPrice = form.price.trim();
  const price = rawPrice ? parsePrice(rawPrice) : 0;
  if (price === null) return { ok: false, error: PRICE_ERROR };
  return { ok: true, invoice: settle({ ...inv, name: form.name.trim(), addr: form.addr.trim(), svc, amt: price }) };
}

// Only a complete, ready invoice opens the send timer. A draft that misses the price, the address or
// the name never does.
export const canSend = (inv: Invoice): boolean => inv.st === "ready" && missingField(inv) === null;

// The filled button on the list: the first ready invoice's "Send invoice", at every width, as in the
// design. The sheet's own (filled) button shows only on a phone, where the sheet hides the list.
export const rowFillNo = (list: readonly Invoice[]): number | undefined => list.find((i) => i.st === "ready")?.no;

// The one field of a draft and its error: the field names the error it shows.
export function fixFieldA11y(no: number, error: string) {
  const id = `fd-iv-${no}`;
  const errorId = `${id}-e`;
  return { id, errorId, "aria-invalid": error ? (true as const) : undefined, "aria-describedby": error ? errorId : undefined };
}

// The send timer reached 0: the invoice is marked Sent on screen. Nothing leaves this app.
export function markSent(inv: Invoice, now: Date): Invoice {
  if (inv.st !== "ready") return inv;
  return { ...inv, st: "sent", justNow: true, dueOn: addDaysIso(toIsoDay(now), INVOICE_DUE_DAYS) };
}

export function markPaid(inv: Invoice, now: Date): Invoice {
  if (inv.st !== "sent") return inv;
  return { ...inv, st: "paid", justNow: true, paidOn: toIsoDay(now), sentJustNow: inv.justNow };
}

// Undo of a Mark paid made on this screen (Payments): back to sent, with the chip it had.
export function unmarkPaid(inv: Invoice): Invoice {
  if (inv.st !== "paid" || inv.sentJustNow === undefined) return inv;
  const { sentJustNow, ...rest } = inv;
  return { ...rest, st: "sent", justNow: sentJustNow, paidOn: null };
}

// Kept-state patches other pages dispatch through useInvoicesKept (functions of the latest state).
export const markPaidPatch = (no: number, now: Date) => (s: { invoices: Invoice[] }) => ({
  invoices: s.invoices.map((i) => (i.no === no ? markPaid(i, now) : i)),
});
export const unmarkPaidPatch = (no: number) => (s: { invoices: Invoice[] }) => ({
  invoices: s.invoices.map((i) => (i.no === no ? unmarkPaid(i) : i)),
});
export const markSentPatch = (no: number, now: Date) => (s: { invoices: Invoice[] }) => ({
  invoices: s.invoices.map((i) => (i.no === no ? markSent(i, now) : i)),
  sel: no,
});

// ---- filters and counts ----------------------------------------------------------------------
const groupOf = (st: InvoiceStatus): Exclude<Filter, "all"> => (st === "need" || st === "ready" ? "todo" : st);
export const matchesFilter = (filter: Filter, st: InvoiceStatus): boolean => filter === "all" || filter === groupOf(st);

export function totals(list: readonly Invoice[], now: Date): { todo: number; owed: number; paid: number } {
  const month = toIsoDay(now).slice(0, 7);
  let todo = 0, owed = 0, paid = 0;
  for (const inv of list) {
    if (groupOf(inv.st) === "todo") todo += 1;
    if (inv.st === "sent") owed += inv.amt;
    if (inv.st === "paid" && inv.paidOn?.slice(0, 7) === month) paid += inv.amt;
  }
  return { todo, owed, paid };
}

// ---- what the screen says --------------------------------------------------------------------
const NEEDS: Record<MissingField, string> = { price: "Needs the price", addr: "Needs the address", name: "Needs the name" };

export function chipFor(inv: Invoice, now: Date): Chip {
  if (inv.st === "need") return { tone: "is-warn", text: NEEDS[missingField(inv) ?? "price"] };
  if (inv.st === "ready") return { tone: "is-plain", text: inv.note || "Ready to send" };
  if (inv.st === "paid") return { tone: "is-ok", text: inv.justNow ? "Paid just now" : `Paid ${inv.paidOn ? formatDay(inv.paidOn) : ""}`.trim() };
  if (inv.justNow) return { tone: "is-ok", text: "Sent just now" };
  const late = inv.dueOn ? daysLate(inv.dueOn, now) : 0;
  if (late > OVER_WEEK_DAYS) return { tone: "is-hot", text: lateText(late) };
  if (late > 0) return { tone: "is-bad", text: lateText(late) };
  return { tone: "is-warn", text: `Due ${inv.dueOn ? formatDay(inv.dueOn) : ""}`.trim() };
}

export function sheetFor(inv: Invoice, now: Date): SheetView {
  const late = inv.st === "sent" && inv.dueOn ? daysLate(inv.dueOn, now) : 0;
  let due: string;
  if (inv.st === "need" || inv.st === "ready") due = `Due ${INVOICE_DUE_DAYS} days after you send it`;
  // As the design: "Due in 7 days" right after a send, the lateness once late, else the due day.
  else if (inv.st === "sent") due = inv.justNow ? `Due in ${INVOICE_DUE_DAYS} days` : late > 0 ? lateText(late) : `Due ${inv.dueOn ? formatDay(inv.dueOn) : ""}`.trim();
  else due = inv.justNow ? "Paid today" : `Paid ${inv.paidOn ? formatDay(inv.paidOn) : ""}`.trim();
  const price = inv.amt > 0 ? formatMoney(inv.amt) : "Price missing";
  return {
    title: `Invoice ${inv.no}`,
    due,
    name: inv.name || "Name missing",
    addr: inv.addr || "Address missing",
    svc: inv.svc,
    lineAmount: price,
    total: price,
    chip: chipFor(inv, now),
  };
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

// The business facts of the sheet: always from the custom values, never from code. `logo` is the
// business logo link from the shell (already checked to be https), or null.
export function businessCard(values: BusinessValues, logo: string | null = null): BusinessCard {
  const name = values.business_name?.trim() ?? "";
  const site = (values.business_website_url ?? "").split("//").pop()?.split("/")[0].replace("www.", "") ?? "";
  return {
    init: initialsOf(name),
    name,
    addr: values.business_address ?? "",
    phone: values.business_phone_number ?? "",
    email: values.business_email ?? "",
    site,
    hours: values.business_hours ?? "",
    logo,
  };
}

// The sheet's header row (logo tile, name, contact lines) and its divider show only when there is
// something to put in it. With no business values at all the sheet starts at its title.
export const hasBusinessHeader = (b: BusinessCard): boolean =>
  Boolean(b.logo || b.name || b.addr || b.phone || b.email || b.site || b.hours);

// What "Send invoice" asks the shell for. The shell counts 20 seconds; at 0 it runs onDone.
export function sendRequest(inv: Invoice, onDone: () => void): SendTimerRequest {
  const total = formatMoney(inv.amt);
  return {
    kind: "Invoice",
    name: inv.name,
    total,
    doc: { title: `Invoice ${inv.no}`, name: inv.name, sub: inv.addr, amount: total, lines: [[inv.svc, total]] },
    onDone,
  };
}

// The rows the shared search finds on this page, from the invoices as they are now (a name or a price
// filled in shows). The layout seeds the same rows from the sample data until the page has opened.
export const invoiceSearchRows = (list: ReadonlyArray<Pick<Invoice, "no" | "name" | "svc" | "amt">>): SearchRow[] =>
  list.map((inv) => ({
    id: `invoice-${inv.no}`,
    page: "invoices",
    name: inv.name || `Invoice ${inv.no}`,
    sub: `Invoice ${inv.no} · ${inv.svc}${inv.amt > 0 ? ` · ${formatMoney(inv.amt)}` : ""}`,
    href: "/invoices",
  }));
