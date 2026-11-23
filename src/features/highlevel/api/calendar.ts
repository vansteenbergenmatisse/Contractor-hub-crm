import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { HighLevelHttpError } from "./client";
import { getTokenService } from "./routes";
import { withStoredLocationToken } from "./stored-token";
import { TokenServiceError } from "./token-service";

// Read-only calendar wiring. Facts and what is unverified: docs/greenlane/hl-api-notes.md. Every call
// here is a GET. Calendar ids are looked up per tenant on each read, because every client has its own.
const CALENDAR_API_VERSION = "2021-04-15"; // the only value the OpenAPI file lists for these two paths
const LOCATION_API_VERSION = "2021-07-28"; // the only value the OpenAPI file lists for this path
const REQUEST_TIMEOUT_MS = 10_000;
const CALENDAR_READ_WINDOW_MS = 60_000;
const EVENT_READS_AT_ONCE = 5;
const HIDDEN_STATUSES = new Set(["cancelled", "invalid"]);

// Proposals, not measured numbers. One page load costs 2 calls plus one per calendar.
export const CALENDAR_READS_PER_MINUTE = 20;
export const MAX_CALENDARS = 25;
export const MAX_EVENTS_PER_CALENDAR = 500;
export const MAX_CALENDAR_RESPONSE_BYTES = 5 * 1024 * 1024;

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
export type CalendarRange = { startMs: number; endMs: number };
export type CalendarWeekRead<R extends CalendarRange = CalendarRange> =
  | { ok: true; timeZone: string; range: R; calendarCount: number; events: CalendarEventRow[]; dropped: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" };

type WithToken = (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
type EventQuery = { locationId: string; calendarId: string; startMs: number; endMs: number };
export type CalendarRequests = {
  location: (accessToken: string, locationId: string) => Promise<Response>;
  calendars: (accessToken: string, locationId: string) => Promise<Response>;
  events: (accessToken: string, query: EventQuery) => Promise<Response>;
};
type ReadDeps = { readLocationId: (tenantId: string) => Promise<string | null>; withToken: WithToken; requests: CalendarRequests };
export type CalendarRuntime = {
  readLocationId: ReadDeps["readLocationId"];
  withLocationToken: WithToken;
  withStoredLocationToken: WithToken;
  requests: CalendarRequests;
};
type Hit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;

class CalendarBodyTooLargeError extends Error {}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const unexpected = () => new Error("HighLevel calendar read returned an unexpected response.");

export function createCalendarRequests(baseUrl: string, doFetch: typeof fetch = fetch): CalendarRequests {
  const base = baseUrl.replace(/\/+$/, "");
  const get = async (path: string, accessToken: string, version: string): Promise<Response> => {
    try {
      return await doFetch(`${base}${path}`, {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}`, version, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel calendar read could not reach HighLevel.", null);
    }
  };
  return {
    location: (token, locationId) => get(`/locations/${encodeURIComponent(locationId)}`, token, LOCATION_API_VERSION),
    calendars: (token, locationId) => get(`/calendars/?${new URLSearchParams({ locationId })}`, token, CALENDAR_API_VERSION),
    events: (token, q) => get(`/calendars/events?${new URLSearchParams({
      locationId: q.locationId, calendarId: q.calendarId, startTime: String(q.startMs), endTime: String(q.endMs),
    })}`, token, CALENDAR_API_VERSION),
  };
}

export function parseLocationTimeZone(json: unknown): string {
  const zone = text(record(record(json)?.location)?.timezone);
  if (!zone) throw unexpected();
  return zone;
}

export function parseCalendarList(json: unknown, locationId: string): { calendars: Array<{ id: string; name: string | null }>; dropped: number } {
  const list = record(json)?.calendars;
  if (!Array.isArray(list)) throw unexpected();
  const calendars: Array<{ id: string; name: string | null }> = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of list) {
    const row = record(raw);
    const id = text(row?.id);
    if (!row || !id || seen.has(id) || (row.locationId !== undefined && row.locationId !== locationId)) dropped += 1;
    else {
      seen.add(id);
      calendars.push({ id, name: text(row.name) });
    }
  }
  return { calendars, dropped };
}

// A time without a zone cannot be placed safely, so it counts as unreadable. The file types these
// fields as "object" with a string example, so a number of milliseconds is accepted too.
function instant(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

// Only what the page shows is kept: no notes, description, contact id or user ids.
export function parseCalendarEvents(json: unknown, locationId: string, calendarId: string): { events: Array<Omit<CalendarEventRow, "calendarName">>; dropped: number; complete: boolean } {
  const list = record(json)?.events;
  if (!Array.isArray(list)) throw unexpected();
  const events: Array<Omit<CalendarEventRow, "calendarName">> = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of list.slice(0, MAX_EVENTS_PER_CALENDAR)) {
    const row = record(raw);
    const id = text(row?.id);
    const startMs = instant(row?.startTime);
    const endMs = instant(row?.endTime);
    const foreign = !!row && ((row.locationId !== undefined && row.locationId !== locationId) || (row.calendarId !== undefined && row.calendarId !== calendarId));
    if (!row || !id || foreign || seen.has(id) || startMs === null || endMs === null || endMs <= startMs) {
      dropped += 1;
      continue;
    }
    seen.add(id);
    const status = text(row.appointmentStatus);
    if (status && HIDDEN_STATUSES.has(status.toLowerCase())) continue;
    events.push({ id, calendarId, title: text(row.title), address: text(row.address), status, startMs, endMs });
  }
  return { events, dropped, complete: list.length <= MAX_EVENTS_PER_CALENDAR };
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CALENDAR_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new CalendarBodyTooLargeError();
  }
  if (!response.body) throw unexpected();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CALENDAR_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new CalendarBodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

async function readJson(deps: ReadDeps, tenantId: string, call: (token: string) => Promise<Response>): Promise<unknown> {
  const response = await deps.withToken(tenantId, call);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new HighLevelHttpError("HighLevel calendar read failed.", response.status);
  }
  return readLimitedJson(response);
}

// Logs hold the step and the status only, never a row, an id, a token or a response body.
function failure(error: unknown): { ok: false; reason: "reconnect" | "unavailable" } {
  if (error instanceof TokenServiceError) {
    console.error(`HighLevel calendar read failed: step=token code=${error.code}`);
    return { ok: false, reason: error.code === "unavailable" ? "unavailable" : "reconnect" };
  }
  if (error instanceof HighLevelHttpError) {
    console.error(`HighLevel calendar read failed: step=request status=${error.status ?? "none"}`);
    return { ok: false, reason: error.status === 401 || error.status === 403 ? "reconnect" : "unavailable" };
  }
  console.error(`HighLevel calendar read failed: step=${error instanceof CalendarBodyTooLargeError ? "size" : "parse"}`);
  return { ok: false, reason: "unavailable" };
}

// The week of one tenant. `boundsFor` turns the location's time zone into the range to read. All or
// nothing: a calendar that fails must not leave a gap that looks like free time. No retry on a 429.
export async function readCalendarWeek<R extends CalendarRange>(deps: ReadDeps, tenantId: string, boundsFor: (timeZone: string) => R | null): Promise<CalendarWeekRead<R>> {
  try {
    const locationId = await deps.readLocationId(tenantId);
    if (!locationId) return { ok: false, reason: "reconnect" };
    const timeZone = parseLocationTimeZone(await readJson(deps, tenantId, (token) => deps.requests.location(token, locationId)));
    const range = boundsFor(timeZone);
    if (!range) {
      console.error("HighLevel calendar read failed: step=timezone");
      return { ok: false, reason: "unavailable" };
    }
    const list = parseCalendarList(await readJson(deps, tenantId, (token) => deps.requests.calendars(token, locationId)), locationId);
    const calendars = list.calendars.slice(0, MAX_CALENDARS);
    let complete = list.calendars.length <= MAX_CALENDARS;
    let dropped = list.dropped;
    const events: CalendarEventRow[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < calendars.length; i += EVENT_READS_AT_ONCE) {
      const batch = calendars.slice(i, i + EVENT_READS_AT_ONCE);
      const pages = await Promise.all(batch.map(async (calendar) => parseCalendarEvents(
        await readJson(deps, tenantId, (token) => deps.requests.events(token, { locationId, calendarId: calendar.id, startMs: range.startMs, endMs: range.endMs })),
        locationId,
        calendar.id,
      )));
      pages.forEach((page, k) => {
        dropped += page.dropped;
        complete = complete && page.complete;
        for (const event of page.events) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          events.push({ ...event, calendarName: batch[k].name });
        }
      });
    }
    return { ok: true, timeZone, range, calendarCount: calendars.length, events, dropped, complete };
  } catch (error) {
    return failure(error);
  }
}

function defaultRuntime(): CalendarRuntime {
  const env = parseEnv("highlevel");
  const tokens = getTokenService();
  return {
    readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    withLocationToken: tokens.withLocationToken,
    withStoredLocationToken,
    requests: createCalendarRequests(env.GHL_API_BASE_URL),
  };
}

// The read behind a limit, counted before any env, token or HighLevel call; a limiter failure denies
// it. With `viewer` (an admin's read-only client view) the stored token is used, nothing is refreshed,
// and the count is the viewer's, so the client's token and quota are left alone.
export function buildCalendarReader(runtime: () => CalendarRuntime, hit: Hit, viewer?: { viewerId: string }) {
  return async <R extends CalendarRange>(tenantId: string, boundsFor: (timeZone: string) => R | null): Promise<CalendarWeekRead<R>> => {
    const key = viewer ? `highlevel-calendar-view:${viewer.viewerId}` : `highlevel-calendar:${tenantId}`;
    let allowed: boolean;
    try {
      allowed = await hit(key, CALENDAR_READS_PER_MINUTE, CALENDAR_READ_WINDOW_MS, new Date());
    } catch {
      console.error("HighLevel calendar read failed: step=limiter");
      return { ok: false, reason: "unavailable" };
    }
    if (!allowed) {
      console.error("HighLevel calendar read failed: step=throttled");
      return { ok: false, reason: "unavailable" };
    }
    let rt: CalendarRuntime;
    try {
      rt = runtime();
    } catch {
      console.error("HighLevel calendar read failed: step=env");
      return { ok: false, reason: "unavailable" };
    }
    return readCalendarWeek({ readLocationId: rt.readLocationId, withToken: viewer ? rt.withStoredLocationToken : rt.withLocationToken, requests: rt.requests }, tenantId, boundsFor);
  };
}

export function createTenantCalendarReader(hit: Hit, viewer?: { viewerId: string }) {
  return buildCalendarReader(defaultRuntime, hit, viewer);
}
