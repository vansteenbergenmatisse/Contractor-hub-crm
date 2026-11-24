// Types shared inside the calendar feature.

// E = estimate (a visit), J = job.
export type StopKind = "E" | "J";

// Weeks are counted from the week that holds "now": 0 is this week, -1 the week before, 1 the
// week after. Days are 0 (Sunday) to 6 (Saturday). `start` counts half hours from 7:00 AM.
export type Placement = { week: number; day: number; start: number };

export type Stop = {
  id: string;
  kind: StopKind;
  name: string;
  service?: string;
  address?: string;
  // Reminder status shown in the detail panel for a stop that is not over.
  status?: string;
  len: number;
  added?: boolean;
} & Placement;

export type CalendarView = "week" | "day";

// What the last page event was, so only the thing you just pressed animates.
export type CalendarEvent = "" | "nav" | "view" | "rs" | "pick";

export type MoveRecord = { id: string; from: Placement; had: boolean };
export type DeleteRecord = { id: string; name: string; kind: StopKind };

export type CalendarState = {
  stops: Stop[];
  wk: number;
  sd: number;
  view: CalendarView;
  selId: string | null;
  picking: boolean;
  moved: Record<string, Placement>;
  lastMove: MoveRecord | null;
  deleted: Record<string, true>;
  lastDelete: DeleteRecord | null;
  confirmId: string | null;
  add: { kind: StopKind; slot: Placement | null } | null;
  addName: string;
  addError: string;
  linkCopied: boolean;
  bumps: number;
  sw: number;
  ev: CalendarEvent;
  fresh: boolean;
  nextAdded: number;
};

export type CalendarAction =
  | { type: "nav"; wk: number; sd: number }
  | { type: "step"; n: number }
  | { type: "today"; day: number }
  | { type: "setView"; view: CalendarView }
  | { type: "selectDay"; day: number }
  | { type: "pick"; id: string }
  // Open a stop named in the URL (?row=<id>): its week, its day and its detail.
  | { type: "openRow"; id: string }
  | { type: "closeDetail" }
  | { type: "openReschedule" }
  | { type: "cancelReschedule" }
  | { type: "move"; id: string; to: Placement }
  | { type: "undoMove" }
  | { type: "askDelete"; id: string }
  | { type: "cancelDelete" }
  | { type: "confirmDelete" }
  | { type: "rescheduleInstead" }
  | { type: "undoDelete" }
  | { type: "openAdd"; kind: StopKind; slot?: Placement | null }
  | { type: "closeAdd" }
  | { type: "setAddName"; name: string }
  | { type: "submitAdd"; placement: Placement }
  | { type: "copyLink" };

// What the page needs from the business: its own booking link, the website (fallback for the link) and
// the hours. Any of them may be "" (or null for the link) when the sub-account has no value.
export type CalendarBusiness = { bookingJobUrl?: string | null; business_website_url: string; business_hours: string };

// Real appointments (read-only). The shape the highlevel adapter hands over; declared here so this
// feature does not depend on it (the server page injects the reader).
export type CalendarEventRow = {
  id: string;
  calendarId: string;
  calendarName: string | null;
  title: string | null;
  address: string | null;
  status: string | null;
  startMs: number;
  endMs: number;
};
export type CalendarWeekReader = <R extends { startMs: number; endMs: number }>(
  tenantId: string,
  boundsFor: (timeZone: string) => R | null,
) => Promise<
  | { ok: true; timeZone: string; range: R; calendarCount: number; events: CalendarEventRow[]; dropped: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" }
>;

// One appointment on one day. `start` and `len` are grid rows (clamped); the labels are the true times.
export type LiveStop = {
  id: string;
  eventId: string;
  day: number;
  start: number;
  // The true start on this day, in minutes after midnight. Grid rows are too coarse to order by.
  startMinute: number;
  // The true end on this day, in minutes after midnight (1440 when it runs past midnight).
  endMinute?: number;
  // The appointment began on an earlier day and continues on this one.
  startedEarlier: boolean;
  len: number;
  lane: number;
  lanes: number;
  name: string;
  service: string;
  address: string;
  statusLabel: string;
  startLabel: string;
  endLabel: string;
  past: boolean;
};
export type CalendarDayInfo = { index: number; short: string; num: number; long: string; aria: string; count: number };
export type CalendarWeekInfo = {
  timeZone: string;
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  todayDay: number | null;
  rangeLabel: string;
  days: CalendarDayInfo[];
};
export type CalendarResult =
  | { state: "ready"; week: CalendarWeekInfo; stops: LiveStop[]; loadedAt: string; complete: boolean; dropped: number }
  | { state: "empty"; week: CalendarWeekInfo; reason: "no-calendars" | "no-appointments" }
  | { state: "reconnect" }
  | { state: "unavailable" };

// One offered time: a day of the shown week and the location's wall-clock start.
export type FreeSlot = { day: number; startMinute: number; label: string };
// open: real times. none: nothing fits. no-hours: the hours could not be read. unsure: a booking may
// be missing. past: the shown week is over.
export type LiveFreeTimes =
  | { state: "open"; visit: FreeSlot[]; job: FreeSlot[] }
  | { state: "none" | "no-hours" | "unsure" | "past" };
