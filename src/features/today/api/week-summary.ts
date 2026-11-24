import type { CalendarResult } from "@/features/calendar";

// The counts Today shows from data that is already read. Null always means "not proven", so the page
// shows "Not available yet". Amounts are left out on purpose: their unit is not established.
// The quote and invoice shapes are declared here because the server page hands the results in.
export type TodayQuotes =
  | { state: "ready"; quotes: ReadonlyArray<{ statusLabel: string | null }>; complete: boolean; dropped: number }
  | { state: "empty" | "reconnect" | "unavailable" }
  | null;
export type TodayInvoices =
  | {
      state: "ready";
      rows: ReadonlyArray<{ bucket: "draft" | "sent" | "paid" | "other"; test: boolean }>;
      total: { count: number } | null;
      blocked: boolean;
      blockedBy?: "processing" | "currencies";
      complete: boolean;
    }
  | { state: "empty" | "reconnect" | "unavailable" }
  | null;

type Ready = Extract<CalendarResult, { state: "ready" }>;
const proven = (result: CalendarResult): result is Ready => result.state === "ready" && result.complete && result.dropped === 0;

// The routes rule accepts job and estimate calendars by exact name; only the job names count here.
const isJobName = (name: string, isAccepted: (name: string) => boolean) => isAccepted(name) && /\bjobs?\b/i.test(name);

// Zero is never claimed: with no job on the board, the client's calendars may just be named differently.
export function jobsThisWeek(result: CalendarResult, isAccepted: (name: string) => boolean): number | null {
  if (!proven(result)) return null;
  const jobs = new Set(result.stops.filter((stop) => isJobName(stop.service, isAccepted)).map((stop) => stop.eventId));
  return jobs.size > 0 ? jobs.size : null;
}

// Appointments that start this week. The read has no creation date, so the start is what counts.
export function bookedThisWeek(result: CalendarResult): number | null {
  if (result.state === "empty") return result.reason === "no-appointments" ? 0 : null;
  if (!proven(result)) return null;
  return new Set(result.stops.filter((stop) => !stop.startedEarlier).map((stop) => stop.eventId)).size;
}

// A block with no named cause may be a row with no status, which could be a draft.
export function invoicesToSend(result: TodayInvoices): number | null {
  if (result?.state === "empty") return 0;
  if (result?.state !== "ready" || !result.complete || (result.blocked && !result.blockedBy)) return null;
  return result.rows.filter((row) => row.bucket === "draft" && !row.test).length;
}

// How many invoices are proven due. The amount is not shown.
export function moneyOwed(result: TodayInvoices): number | null {
  if (result?.state === "empty") return 0;
  if (result?.state !== "ready" || result.blocked) return null;
  return result.total?.count ?? 0;
}

export function quotesOut(result: TodayQuotes): number | null {
  if (result?.state === "empty") return 0;
  if (result?.state !== "ready" || !result.complete || result.dropped > 0) return null;
  if (result.quotes.some((quote) => quote.statusLabel === null)) return null;
  return result.quotes.filter((quote) => quote.statusLabel === "Sent" || quote.statusLabel === "Viewed").length;
}
