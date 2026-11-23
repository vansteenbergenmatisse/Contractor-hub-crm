import type { BlockedBy, DueSummary, InvoicesReader, InvoicesResult, LiveInvoiceRow, LiveInvoiceView } from "../types";

const LABELS: Record<NonNullable<LiveInvoiceRow["status"]>, { label: string; tone: LiveInvoiceView["tone"]; bucket: LiveInvoiceView["bucket"] }> = {
  draft: { label: "Draft", tone: "is-plain", bucket: "draft" },
  sent: { label: "Sent", tone: "is-warn", bucket: "sent" },
  partially_paid: { label: "Partly paid", tone: "is-warn", bucket: "sent" },
  payment_processing: { label: "Payment processing", tone: "is-plain", bucket: "sent" },
  paid: { label: "Paid", tone: "is-ok", bucket: "paid" },
  void: { label: "Void", tone: "is-plain", bucket: "other" },
};
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// The amount exactly as sent. The unit is not documented, so no symbol, rounding or conversion.
export function formatLiveAmount(value: number | null, currency: string | null): string {
  if (value === null) return "Amount not shown";
  const [whole, fraction] = String(value).split(".");
  const grouped = /^\d+$/.test(whole) ? whole.replace(/\B(?=(\d{3})+$)/g, ",") : whole;
  const shown = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  return currency ? `${currency} ${shown}` : shown;
}

const isOpenStatus = (row: LiveInvoiceRow) => row.status === "sent" || row.status === "partially_paid";
const isDue = (row: LiveInvoiceRow) => row.liveMode === true && isOpenStatus(row) && row.amountDue !== null && row.amountDue > 0;
// amountDue above total is caught when the row is parsed (invoices-read.ts), which nulls both.
// An open, non-test row that may be owed but has a field that cannot be trusted. Nothing owed is not blocked.
const isUnreadable = (row: LiveInvoiceRow) =>
  isOpenStatus(row) && row.liveMode !== false && row.amountDue !== 0 &&
  (row.liveMode === null || row.amountDue === null || row.amountDue < 0 || row.currency === null);

// One overall limit for a page load, shared by every read in it. Past it the load gives up.
const BILLING_LOAD_DEADLINE_MS = 25_000;
const DEADLINE_PASSED = Symbol("billing-deadline");
export async function withBillingDeadline<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T | { state: "unavailable" }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<typeof DEADLINE_PASSED>((resolve) => {
    timer = setTimeout(() => {
      resolve(DEADLINE_PASSED);
      controller.abort();
    }, BILLING_LOAD_DEADLINE_MS);
  });
  try {
    const answer = await Promise.race([work(controller.signal), expired]);
    return answer === DEADLINE_PASSED ? { state: "unavailable" } : (answer as T);
  } finally {
    clearTimeout(timer);
  }
}

// Adds without binary rounding noise. Null when an amount cannot be added exactly.
function sumExact(values: number[]): number | null {
  let places = 0;
  for (const value of values) {
    const shown = String(value);
    if (shown.includes("e")) return null;
    places = Math.max(places, shown.split(".")[1]?.length ?? 0);
  }
  if (places > 6) return null;
  const scale = 10 ** places;
  const sum = values.reduce((all, value) => all + Math.round(value * scale), 0);
  return Number.isSafeInteger(sum) ? sum / scale : null;
}

// "Due" means: a live invoice, status sent or partially_paid, with a positive `amountDue`. A total
// exists only when the read is complete and every row that could be owed is fully readable.
export function dueSummary(rows: readonly LiveInvoiceRow[], complete: boolean): DueSummary {
  const due = rows.filter(isDue);
  // A payment still processing may fail, so whether it is owed is not proven either way.
  const noStatus = rows.some((row) => row.status === null && row.liveMode !== false);
  const processing = rows.some((row) => row.status === "payment_processing" && row.liveMode !== false);
  const unknownStatus = noStatus || processing;
  const unreadable = rows.some(isUnreadable);
  const currencies = new Set(due.map((row) => row.currency));
  const amount = unreadable || currencies.size > 1 || due.length === 0 ? null : sumExact(due.map((row) => row.amountDue as number));
  const blocked = !complete || unknownStatus || unreadable || currencies.size > 1 || (due.length > 0 && amount === null);
  const total = blocked || amount === null ? null : { amount, currency: due[0].currency as string, count: due.length };
  const cannotAdd = currencies.size <= 1 && due.length > 0 && amount === null;
  const blockedBy: BlockedBy | undefined = noStatus || unreadable || cannotAdd ? undefined : currencies.size > 1 ? "currencies" : processing ? "processing" : undefined;
  return { due, total, blocked, blockedBy };
}

// The rows Payments lists: what is proven due, and an open row that may be owed but cannot be read.
export const owedOrUnreadable = (rows: readonly LiveInvoiceRow[]): LiveInvoiceRow[] => rows.filter((row) => isDue(row) || isUnreadable(row));

// The warning above a page with no total.
export function blockedNote(complete: boolean, blockedBy?: BlockedBy): string {
  if (!complete) return "Not every invoice could be read, so no total is shown.";
  if (blockedBy === "processing") return "A payment is still processing, so no total is shown.";
  if (blockedBy === "currencies") return "Invoices are in more than one currency, so no total is shown.";
  return "Some invoices could not be read in full, so no total is shown.";
}

export function invoiceView(row: LiveInvoiceRow): LiveInvoiceView {
  const known = row.status ? LABELS[row.status] : { label: "Status not shown", tone: "is-plain" as const, bucket: "other" as const };
  const due = isDue(row);
  const detail = [row.number ? `Invoice ${row.number}` : "Invoice", row.name].filter(Boolean).join(" · ");
  const dueText = due ? (row.dueDate ? `Due ${DAY.format(Date.parse(`${row.dueDate}T00:00:00.000Z`))}` : "Due date not shown") : null;
  return {
    id: row.id,
    name: row.contactName ?? "No name",
    detail,
    statusLabel: known.label,
    tone: known.tone,
    bucket: known.bucket,
    amountText: isUnreadable(row) ? formatLiveAmount(null, null) : formatLiveAmount(due ? row.amountDue : row.total, row.currency),
    dueText,
    test: row.liveMode === false,
  };
}

// The invoices of one tenant, read by `read` (the server page passes its reader). Never sample data.
// Setting the server flag INVOICES_READ_DISABLED=true turns the read off.
export async function loadInvoices(tenantId: string | null | undefined, read: InvoicesReader): Promise<InvoicesResult> {
  if (!tenantId || process.env.INVOICES_READ_DISABLED?.trim() === "true") return { state: "unavailable" };
  let answer;
  try {
    answer = await withBillingDeadline((signal) => read(tenantId, signal));
  } catch {
    return { state: "unavailable" };
  }
  if ("state" in answer) return { state: "unavailable" };
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Invoices: left out ${answer.dropped} rows.`);
  if (answer.rows.length === 0) return answer.complete ? { state: "empty" } : { state: "unavailable" };
  const summary = dueSummary(answer.rows, answer.complete);
  return { state: "ready", rows: answer.rows.map(invoiceView), total: summary.total, blocked: summary.blocked, blockedBy: summary.blockedBy, complete: answer.complete };
}
