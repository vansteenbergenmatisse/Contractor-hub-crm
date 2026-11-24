import type { CalendarResult, FreeSlot, LiveFreeTimes, LiveStop, StopKind } from "../types";
import { parseBusinessHours, type WeekHours } from "./business-hours";
import { NEW_LEN } from "./free-times";
import { minuteLabel, zonedParts } from "./live-week";

const STEP_MINUTES = 30;
const MAX_SLOTS = 3;
const DAY_END = 24 * 60;

// The first start of the day inside the hours, after `after`, that touches no appointment.
function firstFit(stops: readonly LiveStop[], day: number, hours: WeekHours, length: number, after: number): number | null {
  const open = hours[day];
  if (!open) return null;
  const mine = stops.filter((stop) => stop.day === day);
  for (let start = open.open; start + length <= open.close; start += STEP_MINUTES) {
    if (start <= after) continue;
    if (!mine.some((stop) => stop.startMinute < start + length && start < (stop.endMinute ?? DAY_END))) return start;
  }
  return null;
}

// One free time per day in the shown week, from the client's hours, in the location's time zone. A
// week that may be missing a booking offers nothing, because a gap could be a real appointment.
export function liveFreeTimes(
  result: Extract<CalendarResult, { state: "ready" | "empty" }>,
  hoursText: string | null | undefined,
  now: Date,
): LiveFreeTimes {
  const { week } = result;
  const clock = zonedParts(now.getTime(), week.timeZone);
  const thisSunday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day - clock.weekday)).toISOString().slice(0, 10);
  if (week.weekStart < thisSunday) return { state: "past" };
  const hours = parseBusinessHours(hoursText);
  if (!hours) return { state: "no-hours" };
  if (result.state === "empty" ? result.reason === "no-calendars" : !result.complete || result.dropped > 0) return { state: "unsure" };
  const stops = result.state === "ready" ? result.stops : [];
  const today = week.todayDay;
  const nowMinute = clock.hour * 60 + clock.minute;
  const pick = (kind: StopKind): FreeSlot[] => {
    const length = NEW_LEN[kind] * STEP_MINUTES;
    const out: FreeSlot[] = [];
    for (let day = today ?? 0; day < 7 && out.length < MAX_SLOTS; day += 1) {
      const start = firstFit(stops, day, hours, length, day === today ? nowMinute : -1);
      if (start !== null) out.push({ day, startMinute: start, label: minuteLabel(start) });
    }
    return out;
  };
  const visit = pick("E");
  const job = pick("J");
  return visit.length || job.length ? { state: "open", visit, job } : { state: "none" };
}
