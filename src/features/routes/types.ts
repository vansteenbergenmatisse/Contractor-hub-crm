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

export type LocationStatus = "idle" | "asking" | "on" | "denied" | "unavailable" | "unsupported";
