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
