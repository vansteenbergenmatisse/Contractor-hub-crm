import { weekRange } from "@/features/calendar";
import type { RouteEventRow, RouteJob, RoutesReader, RoutesResult } from "../types";
import { parseCoordinates } from "./distance";

const STATUS_LABELS: Record<string, string> = {
  new: "New", confirmed: "Confirmed", showed: "Showed", noshow: "No show", active: "Active", completed: "Completed",
};
// Which HighLevel statuses really occur is unverified (docs/greenlane/hl-api-notes.md). An unknown
// status counts as open, so a job is never hidden from "next" by a guess.
const FINISHED = new Set(["showed", "completed", "noshow"]);
const CANCELLED = new Set(["cancelled", "canceled", "invalid"]);

export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

function clock(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()}`;
}

function timeLabel(row: RouteEventRow, day: { startMs: number; endMs: number }, timeZone: string): string {
  const earlier = row.startMs < day.startMs;
  const later = row.endMs > day.endMs;
  if (earlier && later) return "Started earlier, runs past today";
  if (earlier) return `Started earlier, until ${clock(row.endMs, timeZone)}`;
  if (later) return `${clock(row.startMs, timeZone)}, runs past today`;
  return `${clock(row.startMs, timeZone)} to ${clock(row.endMs, timeZone)}`;
}

function toJob(row: RouteEventRow, day: { startMs: number; endMs: number }, timeZone: string, nowMs: number): RouteJob {
  const status = row.status?.toLowerCase() ?? "";
  const done = FINISHED.has(status);
  return {
    id: row.id,
    name: row.title ?? "Appointment",
    service: row.calendarName ?? "",
    address: row.address,
    coords: parseCoordinates(row.address),
    mapsUrl: row.address ? directionsUrl(row.address) : null,
    timeLabel: timeLabel(row, day, timeZone),
    statusLabel: STATUS_LABELS[status] ?? "",
    done,
    pastTime: !done && row.endMs <= nowMs,
  };
}

// Today's jobs of one tenant, in the location's own time zone. The tenant comes from the session.
// Never sample data: a failure is a state the page shows. CALENDAR_READ_DISABLED also turns this off.
export async function loadRoutes(
  tenantId: string | null | undefined,
  read: RoutesReader,
  now: () => Date = () => new Date(),
): Promise<RoutesResult> {
  if (!tenantId || process.env.CALENDAR_READ_DISABLED?.trim() === "true") return { state: "unavailable" };
  const at = now();
  let answer;
  try {
    answer = await read(tenantId, (timeZone) => {
      const week = weekRange(timeZone, null, at);
      if (!week || week.todayDay === null) return null;
      return { startMs: week.dayStarts[week.todayDay], endMs: week.dayStarts[week.todayDay + 1] };
    });
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Routes: left out ${answer.dropped} malformed rows.`);
  const { range: day, timeZone } = answer;
  const partial = answer.dropped > 0 || !answer.complete;
  const jobs = answer.events
    .filter((row) => row.startMs < day.endMs && row.endMs > day.startMs && !CANCELLED.has(row.status?.toLowerCase() ?? ""))
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
    .map((row) => toJob(row, day, timeZone, at.getTime()));
  if (jobs.length === 0) {
    // A gap that may hide a real booking must not read as a free day.
    if (partial) return { state: "unavailable" };
    return { state: "empty", timeZone, reason: answer.calendarCount === 0 ? "no-calendars" : "no-appointments" };
  }
  return { state: "ready", timeZone, jobs, nextId: jobs.find((job) => !job.done)?.id ?? null, partial };
}
