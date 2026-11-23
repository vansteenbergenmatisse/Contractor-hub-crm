import type { CalendarEventRow, CalendarWeekInfo, LiveStop } from "../types";
import { dayAria, dayLong, DAYS, GRID_ROWS, weekRangeLabel } from "./dates";

// Real appointments on the design's grid. Every date here is the date in the location's own time
// zone, because the server's and the visitor's zones can both differ from it.
const FIRST_MINUTE = 7 * 60;
const DAY_MS = 86_400_000;
// Proposal, not a business rule: how far the URL may move the read from this week.
const MAX_WEEKS_AWAY = 52;
const STATUS_LABELS: Record<string, string> = {
  new: "New", confirmed: "Confirmed", showed: "Showed", noshow: "No show", active: "Active", completed: "Completed",
};

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };
export type WeekRange = { startMs: number; endMs: number; weekStart: string; prevWeek: string; nextWeek: string; todayDay: number | null; dayStarts: number[] };

export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const [year, month, day] = [get("year"), get("month"), get("day")];
  return { year, month, day, hour: get("hour"), minute: get("minute"), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

// The instant the given calendar date starts in the zone (checked twice, for a clock change).
function zonedMidnight(utcDate: number, timeZone: string): number {
  const offsetAt = (ms: number) => {
    const p = zonedParts(ms, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60_000) * 60_000;
  };
  const first = utcDate - offsetAt(utcDate);
  return utcDate - offsetAt(first);
}

const isoDate = (utc: number): string => new Date(utc).toISOString().slice(0, 10);

function requestedSunday(week: string | null | undefined): number | null {
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
  const utc = Date.parse(`${week}T00:00:00Z`);
  if (Number.isNaN(utc) || isoDate(utc) !== week || new Date(utc).getUTCDay() !== 0) return null;
  return utc;
}

// The Sunday-to-Sunday week to read. An unusable `week` means this week. Null for an unknown zone.
export function weekRange(timeZone: string, week: string | null | undefined, now: Date): WeekRange | null {
  let today: ZonedParts;
  try {
    today = zonedParts(now.getTime(), timeZone);
  } catch {
    return null;
  }
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const thisSunday = todayUtc - today.weekday * DAY_MS;
  const asked = requestedSunday(week);
  const sunday = asked !== null && Math.abs(asked - thisSunday) <= MAX_WEEKS_AWAY * 7 * DAY_MS ? asked : thisSunday;
  const dayStarts = Array.from({ length: 8 }, (_, d) => zonedMidnight(sunday + d * DAY_MS, timeZone));
  return {
    startMs: dayStarts[0], endMs: dayStarts[7], weekStart: isoDate(sunday),
    prevWeek: isoDate(sunday - 7 * DAY_MS), nextWeek: isoDate(sunday + 7 * DAY_MS),
    todayDay: sunday === thisSunday ? today.weekday : null, dayStarts,
  };
}

const minuteLabel = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${m < 10 ? "0" : ""}${m} ${h < 12 ? "AM" : "PM"}`;
};

// Overlapping stops of one day get side-by-side lanes, so none is drawn on top of another.
function assignLanes(stops: LiveStop[]): void {
  for (let day = 0; day < 7; day += 1) {
    const mine = stops.filter((s) => s.day === day).sort((a, b) => a.start - b.start);
    let group: LiveStop[] = [];
    let groupEnd = -1;
    const close = () => {
      const lanes = Math.max(0, ...group.map((s) => s.lane + 1));
      group.forEach((s) => { s.lanes = lanes; });
      group = [];
    };
    for (const stop of mine) {
      if (stop.start >= groupEnd) {
        close();
        groupEnd = -1;
      }
      const taken = new Set(group.filter((s) => s.start + s.len > stop.start).map((s) => s.lane));
      let lane = 0;
      while (taken.has(lane)) lane += 1;
      stop.lane = lane;
      group.push(stop);
      groupEnd = Math.max(groupEnd, stop.start + stop.len);
    }
    close();
  }
}

// One stop per day an appointment touches. The row is clamped to the grid; the labels stay true.
export function toStops(events: readonly CalendarEventRow[], range: WeekRange, timeZone: string, nowMs: number): LiveStop[] {
  const stops: LiveStop[] = [];
  for (const event of events) {
    for (let day = 0; day < 7; day += 1) {
      const dayStart = range.dayStarts[day];
      const dayEnd = range.dayStarts[day + 1];
      const from = Math.max(event.startMs, dayStart);
      const to = Math.min(event.endMs, dayEnd);
      if (from >= to) continue;
      const a = zonedParts(from, timeZone);
      const b = zonedParts(to, timeZone);
      const startMinute = a.hour * 60 + a.minute;
      const endMinute = to === dayEnd ? 24 * 60 : b.hour * 60 + b.minute;
      const start = Math.min(Math.max(Math.floor((startMinute - FIRST_MINUTE) / 30), 0), GRID_ROWS - 1);
      const endRow = Math.min(Math.max(Math.ceil((endMinute - FIRST_MINUTE) / 30), start + 1), GRID_ROWS);
      stops.push({
        id: `${event.id}:${day}`, eventId: event.id, day, start, startMinute, startedEarlier: event.startMs < dayStart, len: endRow - start, lane: 0, lanes: 1,
        name: event.title ?? "Appointment", service: event.calendarName ?? "", address: event.address ?? "",
        statusLabel: STATUS_LABELS[event.status?.toLowerCase() ?? ""] ?? "",
        startLabel: minuteLabel(startMinute), endLabel: minuteLabel(endMinute), past: event.endMs <= nowMs,
      });
    }
  }
  stops.sort((x, y) => x.day - y.day || x.start - y.start || x.id.localeCompare(y.id));
  assignLanes(stops);
  return stops;
}

// The labels of the week. They use the shared date helpers on the week's own Sunday.
export function weekInfo(range: WeekRange, timeZone: string, stops: readonly LiveStop[]): CalendarWeekInfo {
  const [year, month, date] = range.weekStart.split("-").map(Number);
  const sunday = new Date(year, month - 1, date);
  const counts = [0, 1, 2, 3, 4, 5, 6].map((d) => new Set(stops.filter((s) => s.day === d).map((s) => s.eventId)).size);
  return {
    timeZone, weekStart: range.weekStart, prevWeek: range.prevWeek, nextWeek: range.nextWeek, todayDay: range.todayDay,
    rangeLabel: weekRangeLabel(sunday, 0),
    days: DAYS.map((short, d) => ({
      index: d, short, num: new Date(year, month - 1, date + d).getDate(),
      long: dayLong(sunday, 0, d), aria: dayAria(sunday, 0, d, counts[d]), count: counts[d],
    })),
  };
}
