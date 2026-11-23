import type { CalendarResult, LiveStop } from "@/features/calendar";

export type TodayCalendar = {
  // Today's appointments in time order.
  stops: LiveStop[];
  // False when a read was cut off or left rows out, so a count or a free day cannot be claimed.
  proven: boolean;
  week: number;
};

// Null when the calendar could not be read.
export function todayCalendar(result: CalendarResult): TodayCalendar | null {
  if (result.state === "empty") return { stops: [], proven: true, week: 0 };
  if (result.state !== "ready") return null;
  const stops = result.stops
    .filter((stop) => stop.day === result.week.todayDay)
    .sort((a, b) => a.start - b.start || a.lane - b.lane);
  return { stops, proven: result.complete && result.dropped === 0, week: result.stops.length };
}

export function stopWhen(stops: readonly LiveStop[], stop: LiveStop): "past" | "next" | "later" {
  if (stop.past) return "past";
  return stops.find((item) => !item.past)?.id === stop.id ? "next" : "later";
}
