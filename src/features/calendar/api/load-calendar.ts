import type { CalendarResult, CalendarWeekReader } from "../types";
import { toStops, weekInfo, weekRange, type WeekRange } from "./live-week";

// The location's HighLevel time zone, when this read learned it.
export function calendarTimeZone(result: CalendarResult | null): string | null {
  return result?.state === "ready" || result?.state === "empty" ? result.week.timeZone : null;
}

// One week of one tenant, read by `read` (the server page passes its reader). The tenant comes from
// the server session. Never sample data: a failure is a state the page shows. Setting the server flag
// CALENDAR_READ_DISABLED=true turns the read off and shows the unavailable state.
export async function loadCalendar(
  tenantId: string | null | undefined,
  week: string | null | undefined,
  read: CalendarWeekReader,
  now: () => Date = () => new Date(),
): Promise<CalendarResult> {
  if (!tenantId || process.env.CALENDAR_READ_DISABLED?.trim() === "true") return { state: "unavailable" };
  const at = now();
  let answer;
  try {
    answer = await read(tenantId, (timeZone) => weekRange(timeZone, week, at));
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Calendar: left out ${answer.dropped} malformed rows.`);
  const range = answer.range as WeekRange;
  const stops = toStops(answer.events, range, answer.timeZone, at.getTime());
  const info = weekInfo(range, answer.timeZone, stops);
  if (stops.length === 0) {
    // A gap that may hide a real booking must not read as a free week.
    if (answer.dropped > 0 || !answer.complete) return { state: "unavailable" };
    return { state: "empty", week: info, reason: answer.calendarCount === 0 ? "no-calendars" : "no-appointments" };
  }
  return { state: "ready", week: info, stops, loadedAt: at.toISOString(), complete: answer.complete, dropped: answer.dropped };
}
