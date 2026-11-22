import type { Placement } from "../types";

// Week and time arithmetic. Everything takes a `now` Date so tests can fix the clock.
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

// The grid runs from 7:00 AM in half hours, 22 rows (to 6:00 PM).
export const GRID_ROWS = 22;
const FIRST_MINUTE = 7 * 60;

// The date of day `d` (0 = Sunday) in week `wk`, counted from the week that holds `now`.
export function dayDate(now: Date, wk: number, d: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7 * wk + d);
}

export const isToday = (now: Date, wk: number, d: number): boolean => wk === 0 && d === now.getDay();

// Day position counted from the Sunday of this week, and back.
export const toDayIndex = (wk: number, d: number): number => wk * 7 + d;
export function fromDayIndex(k: number): { wk: number; sd: number } {
  return { wk: Math.floor(k / 7), sd: ((k % 7) + 7) % 7 };
}

// "9:30 AM" for a half-hour slot counted from 7:00 AM.
export function slotLabel(t: number): string {
  const m = FIRST_MINUTE + t * 30;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${((h + 11) % 12) + 1}:${mm < 10 ? "0" : ""}${mm} ${h < 12 ? "AM" : "PM"}`;
}

// "10:07", the time on the now line (no AM or PM, like the design).
export const clockLabel = (now: Date): string => `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, "0")}`;

// "Fri, Nov 20"
export function dayShort(now: Date, wk: number, d: number): string {
  const x = dayDate(now, wk, d);
  return `${DAYS[d]}, ${MONTHS[x.getMonth()]} ${x.getDate()}`;
}

// "Friday, Nov 20"
export function dayLong(now: Date, wk: number, d: number): string {
  const x = dayDate(now, wk, d);
  return `${DAYS_LONG[d]}, ${MONTHS[x.getMonth()]} ${x.getDate()}`;
}

// "Nov 15 – 21, 2026" or "Nov 29 – Dec 5, 2026"
export function weekRangeLabel(now: Date, wk: number): string {
  const a = dayDate(now, wk, 0);
  const b = dayDate(now, wk, 6);
  const end = `${a.getMonth() === b.getMonth() ? "" : `${MONTHS[b.getMonth()]} `}${b.getDate()}`;
  return `${MONTHS[a.getMonth()]} ${a.getDate()} – ${end}, ${b.getFullYear()}`;
}

// Spoken label of a day button: "Friday, November 20, 2 stops".
export function dayAria(now: Date, wk: number, d: number, count: number): string {
  const x = dayDate(now, wk, d);
  const what = count ? `${count} ${count === 1 ? "stop" : "stops"}` : "nothing booked";
  return `${DAYS_LONG[d]}, ${MONTHS_LONG[x.getMonth()]} ${x.getDate()}, ${what}`;
}

// Where the now line sits in this week's grid. Null outside 7:00 AM to 6:00 PM. `row` is the grid row
// (1 based) and `column` the grid column (the first column holds the hour labels).
export function nowPosition(now: Date): { day: number; row: number; column: number; label: string } | null {
  const t = Math.floor((now.getHours() * 60 + now.getMinutes() - FIRST_MINUTE) / 30);
  if (t < 0 || t >= GRID_ROWS) return null;
  return { day: now.getDay(), row: t + 1, column: now.getDay() + 2, label: clockLabel(now) };
}

// When a stop ends.
export function stopEnd(now: Date, p: Placement, len: number): Date {
  const d = dayDate(now, p.week, p.day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, FIRST_MINUTE + (p.start + len) * 30);
}

// A stop is over when it has ended (a stop in progress is not over).
export const isPast = (now: Date, p: Placement, len: number): boolean => stopEnd(now, p, len).getTime() <= now.getTime();
