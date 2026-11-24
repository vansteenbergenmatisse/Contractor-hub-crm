// Public API of the calendar feature. Other code imports from "@/features/calendar" only.
export { CalendarPage } from "./components/CalendarPage";
export { CalendarPageFromUrl } from "./components/CalendarPageFromUrl";
export { CalendarActions } from "./components/CalendarActions";
export { MOCK_STOPS, MOCK_TODAY, mockStopsFor } from "./mock";

// Pure logic (state, dates, free times, view model, pointer maths). Exported so tests can reach it.
export { calendarReducer, initialState, liveStops, placementOf, ADD_NAME_ERROR } from "./api/state";
export {
  DAYS, GRID_ROWS, clockLabel, dayAria, dayDate, dayLong, dayShort, fromDayIndex, isPast, isToday,
  nowPosition, slotLabel, stopEnd, toDayIndex, weekRangeLabel,
} from "./api/dates";
export { CANDIDATE_STARTS, NEW_LEN, freeTimes } from "./api/free-times";
export { dayAtX, dropStart, slotAtY } from "./api/grid";
export { useStopDrag } from "./hooks/use-stop-drag";
export { addOptions, bookingLink, buildView, confirmSafeButton, daySummary, rescheduleOptions, siteOf } from "./api/view";
export type { CalendarAction, CalendarBusiness, CalendarState, Placement, Stop, StopKind } from "./types";

// The real, read-only page.
export { CalendarLivePage } from "./components/CalendarLivePage";
export { CalendarSkeleton } from "./components/CalendarSkeleton";
export { calendarTimeZone, loadCalendar } from "./api/load-calendar";
export { weekRange } from "./api/live-week";
export { parseBusinessHours, type DayHours, type WeekHours } from "./api/business-hours";
export { liveFreeTimes } from "./api/live-free-times";
export type { CalendarEventRow, CalendarResult, CalendarWeekInfo, CalendarWeekReader, FreeSlot, LiveFreeTimes, LiveStop } from "./types";
