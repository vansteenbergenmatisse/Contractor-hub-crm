import { dueSummary, formatLiveAmount, invoiceView, owedOrUnreadable, withBillingDeadline, type InvoicesReader } from "@/features/invoices";
import type { LiveTransactionRow, LiveTransactionView, PaymentsResult, TransactionsRead, TransactionsReader } from "../types";

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Status values are not documented, so the text is shown as sent, only made readable.
function statusLabel(status: string | null): string {
  if (!status) return "Status not shown";
  const words = status.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function transactionView(row: LiveTransactionRow): LiveTransactionView {
  return {
    id: row.id,
    name: row.contactName ?? "No name",
    statusLabel: statusLabel(row.status),
    amountText: formatLiveAmount(row.amount, row.currency),
    refundText: row.amountRefunded !== null && row.amountRefunded > 0 ? `${formatLiveAmount(row.amountRefunded, row.currency)} refunded` : null,
    dateText: row.createdAt ? `${DAY.format(Date.parse(row.createdAt))} (UTC)` : "Date not shown",
    test: row.liveMode === false,
  };
}

const newestFirst = (a: LiveTransactionRow, b: LiveTransactionRow) => (b.createdAt ? Date.parse(b.createdAt) : -Infinity) - (a.createdAt ? Date.parse(a.createdAt) : -Infinity) || 0;

async function readTransactions(read: TransactionsReader, tenantId: string, signal: AbortSignal): Promise<TransactionsRead> {
  try {
    return await read(tenantId, signal);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// Who owes what comes from invoices only; a transaction does not say what is still owed, so
// transactions are listed and never added up. Without a complete invoice read, nothing claims that
// nobody owes. PAYMENTS_READ_DISABLED=true or INVOICES_READ_DISABLED=true turns this read off.
export async function loadPayments(
  tenantId: string | null | undefined,
  read: { invoices: InvoicesReader; transactions: TransactionsReader },
): Promise<PaymentsResult> {
  if (!tenantId || process.env.PAYMENTS_READ_DISABLED?.trim() === "true" || process.env.INVOICES_READ_DISABLED?.trim() === "true") return { state: "unavailable" };
  try {
    return await withBillingDeadline((signal) => readBoth(tenantId, read, signal));
  } catch {
    return { state: "unavailable" };
  }
}

async function readBoth(tenantId: string, read: { invoices: InvoicesReader; transactions: TransactionsReader }, signal: AbortSignal): Promise<PaymentsResult> {
  const invoices = await read.invoices(tenantId, signal);
  if (!invoices.ok) return { state: invoices.reason };
  const summary = dueSummary(invoices.rows, invoices.complete);
  if (summary.due.length === 0 && !invoices.complete) return { state: "unavailable" };
  const answer = await readTransactions(read.transactions, tenantId, signal);
  if (answer.ok && answer.dropped > 0) console.warn(`Payments: left out ${answer.dropped} rows.`);
  if (summary.due.length === 0 && !summary.blocked && answer.ok && answer.complete && answer.rows.length === 0) return { state: "empty" };
  return {
    state: "ready",
    due: owedOrUnreadable(invoices.rows).map(invoiceView),
    total: summary.total,
    blocked: summary.blocked,
    blockedBy: summary.blockedBy,
    complete: invoices.complete,
    transactions: answer.ok ? { rows: [...answer.rows].sort(newestFirst).map(transactionView), complete: answer.complete } : null,
  };
}
