import type { EstimateRow, EstimateStatus, EstimatesRead } from "@/features/highlevel";
import type { LiveQuote, QuotesResult } from "../types";

export type QuotesReader = (tenantId: string) => Promise<EstimatesRead>;

const STATUS: Record<EstimateStatus, { label: string; tone: LiveQuote["statusTone"] }> = {
  draft: { label: "Draft", tone: "is-plain" },
  sent: { label: "Sent", tone: "is-plain" },
  viewed: { label: "Viewed", tone: "is-warn" },
  accepted: { label: "Accepted", tone: "is-ok" },
  declined: { label: "Declined", tone: "is-bad" },
  invoiced: { label: "Invoiced", tone: "is-ok" },
};

// The issue date is a calendar date, so it is shown as written, in UTC.
const issued = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// The amount stays the exact number received: its unit is not documented, so nothing is rounded,
// converted, summed or given a currency symbol.
function toLiveQuote(row: EstimateRow): LiveQuote {
  const status = row.status ? STATUS[row.status] : null;
  return {
    id: row.id,
    title: row.contactName ?? row.name ?? "Quote without a name",
    detail: row.contactName ? row.name : null,
    statusLabel: status?.label ?? null,
    statusTone: status?.tone ?? null,
    amountText: row.amount === null ? null : String(row.amount),
    currency: row.currency,
    issuedLabel: row.issuedMs === null ? null : issued.format(row.issuedMs),
  };
}

// The quotes of one tenant, read by `read` (the server page passes its reader). The tenant comes from
// the server session. Never sample data: a failure is a state the page shows. Setting the server flag
// QUOTES_READ_DISABLED=true turns the read off and shows the unavailable state.
export async function loadQuotes(tenantId: string | null | undefined, read: QuotesReader, now: () => Date = () => new Date()): Promise<QuotesResult> {
  if (!tenantId || process.env.QUOTES_READ_DISABLED === "true") return { state: "unavailable" };
  let answer: EstimatesRead;
  try {
    answer = await read(tenantId);
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Quotes: left out ${answer.dropped} malformed rows.`);
  if (answer.rows.length === 0) {
    // A gap that may hide a real quote must not read as "no quotes".
    if (answer.dropped > 0 || !answer.complete) return { state: "unavailable" };
    return { state: "empty" };
  }
  const rows = [...answer.rows].sort((a, b) => (b.issuedMs ?? -Infinity) - (a.issuedMs ?? -Infinity) || 0);
  return { state: "ready", quotes: rows.map(toLiveQuote), total: answer.total, complete: answer.complete, dropped: answer.dropped, loadedAt: now().toISOString() };
}
