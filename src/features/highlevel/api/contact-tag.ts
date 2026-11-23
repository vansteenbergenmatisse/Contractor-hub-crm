import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { HighLevelHttpError } from "./client";
import { getTokenService } from "./routes";
import { TokenServiceError } from "./token-service";

// The one contact write Routes makes: adding the fixed tag a HighLevel workflow listens for. This app
// never composes or sends a message. Contract and what is unverified: docs/routes-notify.md.
export const CRM_ON_MY_WAY_TAG = "crm_on_my_way";
const CONTACT_API_VERSION = "2021-07-28"; // the only value the OpenAPI file lists for these paths
const CALENDAR_API_VERSION = "2021-04-15";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
// HighLevel answered and did not apply the add. Anything else may have applied it.
const CLEAR_REFUSALS = new Set([400, 401, 403, 404, 409, 422, 429]);

export type ContactTagOutcome = "sent" | "failed" | "no_answer";
export type AppointmentContactQuery = { calendarId: string; appointmentId: string; startMs: number; endMs: number };
export type AppointmentContactRead = { ok: true; contactId: string | null } | { ok: false };
export type ContactTagState = { ok: true; hasTag: boolean } | { ok: false };
export type ContactTagRequests = {
  events: (accessToken: string, query: { locationId: string; calendarId: string; startMs: number; endMs: number }) => Promise<Response>;
  contact: (accessToken: string, contactId: string) => Promise<Response>;
  removeTag: (accessToken: string, contactId: string) => Promise<Response>;
  addTag: (accessToken: string, contactId: string) => Promise<Response>;
};
export type ContactTagDeps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  withToken: (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
  requests: ContactTagRequests;
};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export function createContactTagRequests(baseUrl: string, doFetch: typeof fetch = fetch): ContactTagRequests {
  const base = baseUrl.replace(/\/+$/, "");
  const send = async (path: string, accessToken: string, version: string, method: string, body?: string): Promise<Response> => {
    try {
      return await doFetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`, version, accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel contact tag call could not reach HighLevel.", null);
    }
  };
  const tagBody = JSON.stringify({ tags: [CRM_ON_MY_WAY_TAG] });
  const tagPath = (contactId: string) => `/contacts/${encodeURIComponent(contactId)}/tags`;
  return {
    events: (token, q) => send(`/calendars/events?${new URLSearchParams({
      locationId: q.locationId, calendarId: q.calendarId, startTime: String(q.startMs), endTime: String(q.endMs),
    })}`, token, CALENDAR_API_VERSION, "GET"),
    contact: (token, contactId) => send(`/contacts/${encodeURIComponent(contactId)}`, token, CONTACT_API_VERSION, "GET"),
    removeTag: (token, contactId) => send(tagPath(contactId), token, CONTACT_API_VERSION, "DELETE", tagBody),
    addTag: (token, contactId) => send(tagPath(contactId), token, CONTACT_API_VERSION, "POST", tagBody),
  };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new HighLevelHttpError("HighLevel contact tag read failed.", response.status);
  }
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error("too large");
  }
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error("too large");
  return JSON.parse(body);
}

// Logs hold the step and the status only, never an id, a token or a response body.
const logFailure = (step: string, error: unknown) => {
  const detail = error instanceof HighLevelHttpError ? `status=${error.status ?? "none"}` : error instanceof TokenServiceError ? `code=${error.code}` : "other";
  console.error(`Routes notify failed: step=${step} ${detail}`);
};

export function createContactTagAdapter(deps: ContactTagDeps) {
  async function readAppointmentContact(tenantId: string, query: AppointmentContactQuery): Promise<AppointmentContactRead> {
    try {
      const locationId = await deps.readLocationId(tenantId);
      if (!locationId) return { ok: false };
      const json = await readJson(await deps.withToken(tenantId, (token) => deps.requests.events(token, {
        locationId, calendarId: query.calendarId, startMs: query.startMs, endMs: query.endMs,
      })));
      const list = record(json)?.events;
      if (!Array.isArray(list)) return { ok: false };
      const row = list.map(record).find((item) => item?.id === query.appointmentId);
      if (!row || row.locationId !== locationId || row.calendarId !== query.calendarId) return { ok: false };
      return { ok: true, contactId: text(row.contactId) };
    } catch (error) {
      logFailure("appointment", error);
      return { ok: false };
    }
  }

  // Also proves the contact belongs to this tenant's location before anything is written to it.
  async function readContactTagState(tenantId: string, contactId: string): Promise<ContactTagState> {
    try {
      const locationId = await deps.readLocationId(tenantId);
      if (!locationId) return { ok: false };
      const json = await readJson(await deps.withToken(tenantId, (token) => deps.requests.contact(token, contactId)));
      const contact = record(record(json)?.contact);
      if (!contact || contact.id !== contactId || contact.locationId !== locationId || !Array.isArray(contact.tags)) return { ok: false };
      return { ok: true, hasTag: contact.tags.some((tag) => typeof tag === "string" && tag.trim().toLowerCase() === CRM_ON_MY_WAY_TAG) };
    } catch (error) {
      logFailure("contact", error);
      return { ok: false };
    }
  }

  // One attempt each, no retry. A workflow fires when the tag is added, so a tag left from an earlier
  // job is removed first. If that removal fails, adding would fire nothing, so the add is skipped.
  async function pulseTag(tenantId: string, contactId: string, hasTag: boolean): Promise<ContactTagOutcome> {
    if (hasTag) {
      try {
        const removed = await deps.withToken(tenantId, (token) => deps.requests.removeTag(token, contactId));
        await removed.body?.cancel().catch(() => {});
        if (!removed.ok) throw new HighLevelHttpError("HighLevel tag removal failed.", removed.status);
      } catch (error) {
        logFailure("remove", error);
        return "failed";
      }
    }
    try {
      const added = await deps.withToken(tenantId, (token) => deps.requests.addTag(token, contactId));
      await added.body?.cancel().catch(() => {});
      if (added.ok) return "sent";
      logFailure("add", new HighLevelHttpError("HighLevel tag add failed.", added.status));
      return CLEAR_REFUSALS.has(added.status) ? "failed" : "no_answer";
    } catch (error) {
      logFailure("add", error);
      return error instanceof TokenServiceError ? "failed" : "no_answer";
    }
  }

  return { readAppointmentContact, readContactTagState, pulseTag };
}

export function createTenantContactTagAdapter() {
  const env = parseEnv("highlevel");
  return createContactTagAdapter({
    readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    withToken: getTokenService().withLocationToken,
    requests: createContactTagRequests(env.GHL_API_BASE_URL),
  });
}
