import type { CalendarEventRow, CalendarWeekReader } from "@/features/calendar";

// Types shared inside the routes feature. The server page injects the tenant's calendar reader.
export type RouteEventRow = CalendarEventRow;
export type RoutesReader = CalendarWeekReader;
export type LatLng = { lat: number; lng: number };

export type RouteJob = {
  id: string;
  name: string;
  service: string;
  address: string | null;
  // Only when the address text is itself a coordinate pair. Addresses are not geocoded.
  coords: LatLng | null;
  mapsUrl: string | null;
  timeLabel: string;
  statusLabel: string;
  // From HighLevel's status only. A time that has passed does not make a job done.
  done: boolean;
  pastTime: boolean;
};

export type RoutesResult =
  | { state: "ready"; timeZone: string; jobs: RouteJob[]; nextId: string | null; partial: boolean }
  | { state: "empty"; timeZone: string; reason: "no-calendars" | "no-appointments" }
  | { state: "reconnect" }
  | { state: "unavailable" };

// What a Start did. "unconfirmed" means HighLevel gave no answer, so the client may have been told.
export type NotifyOutcome = "notified" | "failed" | "unconfirmed";
// Why nothing was sent. Only these are safe to try again.
export type NotifyRefusal = "wrong_type" | "not_next" | "no_contact" | "past" | "unsure_next" | "unavailable";
export type NotifyDisplay = { status: NotifyOutcome } | { status: "refused"; reason: NotifyRefusal };
// Null or left out: no toggle (flag off, an admin, or View as client).
export type RoutesNotifyView = { userId: string; outcomes: Record<string, NotifyOutcome> };

export type LocationStatus = "idle" | "asking" | "on" | "denied" | "unavailable" | "unsupported";
