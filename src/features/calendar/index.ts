// Public API of the calendar feature. Other code imports from "@/features/calendar" only.
export { CalendarPage } from "./components/CalendarPage";
export { CalendarActions } from "./components/CalendarActions";
export { MOCK_STOPS } from "./mock";

// Pure logic (state, dates, free times, view model, pointer maths). Exported so tests can reach it.
export { calendarReducer, initialState, liveStops, placementOf, ADD_NAME_ERROR } from "./api/state";
export {
  DAYS, GRID_ROWS, clockLabel, dayAria, dayDate, dayLong, dayShort, fromDayIndex, isPast, isToday,
  nowPosition, slotLabel, stopEnd, toDayIndex, weekRangeLabel,
} from "./api/dates";
export { CANDIDATE_STARTS, NEW_LEN, freeTimes } from "./api/free-times";
export { dayAtX, dropStart, slotAtY } from "./api/grid";
export { addOptions, bookingLink, buildView, daySummary, rescheduleOptions, siteOf } from "./api/view";
export type { CalendarAction, CalendarBusiness, CalendarState, Placement, Stop, StopKind } from "./types";
