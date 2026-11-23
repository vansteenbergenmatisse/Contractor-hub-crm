import type { CalendarResult, LiveStop } from "@/features/calendar";

export type TodayCalendar = {
  // Today's appointments in time order.
  stops: LiveStop[];
  // False when a read was cut off or left rows out, so a count or a free day cannot be claimed.
  proven: boolean;
  // Appointments this week. One that spans several days counts once.
  week: number;
  // The sub-account has no calendar, so an empty day says nothing about free time.
  noCalendars: boolean;
};

// Null when the calendar could not be read.
export function todayCalendar(result: CalendarResult): TodayCalendar | null {
  if (result.state === "empty") return { stops: [], proven: true, week: 0, noCalendars: result.reason === "no-calendars" };
  if (result.state !== "ready") return null;
  const stops = result.stops
    .filter((stop) => stop.day === result.week.todayDay)
    .sort((a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id));
  return {
    stops,
    proven: result.complete && result.dropped === 0,
    week: new Set(result.stops.map((stop) => stop.eventId)).size,
    noCalendars: false,
  };
}

// On a partial day the real next appointment may be missing, so none is marked.
export function stopWhen(day: Pick<TodayCalendar, "stops" | "proven">, stop: LiveStop): "past" | "next" | "later" {
  if (stop.past) return "past";
  return day.proven && day.stops.find((item) => !item.past)?.id === stop.id ? "next" : "later";
}
