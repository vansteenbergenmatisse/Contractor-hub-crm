import type { DueSummary, InvoicesReader, InvoicesResult, LiveInvoiceRow, LiveInvoiceView } from "../types";

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
const isDue = (row: LiveInvoiceRow) => row.liveMode !== false && isOpenStatus(row) && row.amountDue !== 0;

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
  const unknownStatus = rows.some((row) => (row.status === null || row.status === "payment_processing") && row.liveMode !== false);
  const unreadable = due.some((row) => row.liveMode === null || row.amountDue === null || row.currency === null);
  const currencies = new Set(due.map((row) => row.currency));
  const amount = unreadable || currencies.size > 1 || due.length === 0 ? null : sumExact(due.map((row) => row.amountDue as number));
  const blocked = !complete || unknownStatus || unreadable || currencies.size > 1 || (due.length > 0 && amount === null);
  const total = blocked || amount === null ? null : { amount, currency: due[0].currency as string, count: due.length };
  return { due, total, blocked };
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
    amountText: formatLiveAmount(due ? row.amountDue : row.total, row.currency),
    dueText,
    test: row.liveMode === false,
  };
}

// The invoices of one tenant, read by `read` (the server page passes its reader). Never sample data.
// Setting the server flag INVOICES_READ_DISABLED=true turns the read off.
export async function loadInvoices(tenantId: string | null | undefined, read: InvoicesReader): Promise<InvoicesResult> {
  if (!tenantId || process.env.INVOICES_READ_DISABLED === "true") return { state: "unavailable" };
  let answer;
  try {
    answer = await read(tenantId);
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Invoices: left out ${answer.dropped} rows.`);
  if (answer.rows.length === 0) return answer.complete ? { state: "empty" } : { state: "unavailable" };
  const summary = dueSummary(answer.rows, answer.complete);
  return { state: "ready", rows: answer.rows.map(invoiceView), total: summary.total, blocked: summary.blocked, complete: answer.complete };
}
