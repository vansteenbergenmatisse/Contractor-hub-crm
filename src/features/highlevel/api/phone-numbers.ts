import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { HighLevelHttpError } from "./client";
import { getTokenService } from "./routes";
import { withStoredLocationToken } from "./stored-token";
import { TokenServiceError } from "./token-service";

// Read-only list of the location's active phone numbers. Scope `phonenumbers.read`. Field names come
// from HighLevel's public `apps/phone-system.json`, which names `2021-07-28` as the Version; this file
// sends `v3` because the ticket asks for it. The marketplace docs show the v3 answer wrapped in `data`,
// so `parsePhoneNumbers` reads both shapes. No live call was made, so neither is confirmed.
const PHONE_API_VERSION = "v3";
const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const READ_WINDOW_MS = 60_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_LENGTH = 100;
// A proposal, not a measured number.
export const PHONE_READS_PER_MINUTE = 10;

export type HighLevelPhoneNumber = { number: string; name: string | null };
export type PhoneNumbersFailure = "no-access" | "not-connected" | "inactive" | "unavailable";
export type PhoneNumbersRead = { ok: true; numbers: HighLevelPhoneNumber[]; complete: boolean } | { ok: false; reason: PhoneNumbersFailure };

export type PhoneNumberRequests = { list: (accessToken: string, locationId: string) => Promise<Response> };
type WithToken = (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
type ReadDeps = { readLocationId: (tenantId: string) => Promise<string | null>; withToken: WithToken; requests: PhoneNumberRequests };
export type PhoneNumbersRuntime = { readLocationId: ReadDeps["readLocationId"]; withLocationToken: WithToken; withStoredLocationToken: WithToken; requests: PhoneNumberRequests };
type Hit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;

class InactiveAccountError extends Error {}
// Which shape check failed, for the log. `keys` holds top-level key names only (plain ones, at most
// five): the shape of the answer, never a value.
class PhoneShapeError extends Error {
  constructor(readonly detail: string) {
    super(`HighLevel phone read returned an unexpected response (${detail}).`);
  }
}
// A 401 or 403 carried in the body of a 200 answer: an access problem, never "no numbers".
class BodyAccessError extends PhoneShapeError {
  constructor(readonly status: 401 | 403) {
    super(`body-status status=${status}`);
  }
}
const PLAIN_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const keyNames = (body: Record<string, unknown>) => Object.keys(body).filter((key) => PLAIN_KEY.test(key)).slice(0, 5).join(",");
// A message that says the location has no numbers, e.g. "No phone numbers found" or "Numbers not found".
const NO_NUMBERS_MESSAGE = /\bno\s+(phone\s+)?numbers?\b|\bnumbers?\s+not\s+found\b/i;
const isEmptyData = (data: unknown) =>
  data === null || (Array.isArray(data) && data.length === 0) || (typeof data === "object" && data !== null && Object.keys(data).length === 0);

// An answer that is HighLevel's way of saying "this location has no numbers" (a normal state, not an
// error): `numbers: null`, an empty `data` with no numbers key, or a 404 in the body whose message says
// there are no numbers. The live answer had top-level keys status,data,message,statusCode; the values
// were not seen, so these shapes are a reading of that log line, not a confirmed contract.
function saysNoNumbers(top: Record<string, unknown>, statusCode: number | null): boolean {
  const data = top.data;
  if (top.numbers === null) return true;
  if (typeof data === "object" && data !== null && !Array.isArray(data) && (data as Record<string, unknown>).numbers === null) return true;
  if (statusCode === 404) return typeof top.message === "string" && NO_NUMBERS_MESSAGE.test(top.message);
  if (statusCode !== null && statusCode >= 400) return false;
  return !("numbers" in top) && "data" in top && isEmptyData(data);
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_TEXT_LENGTH ? trimmed : null;
};

export function createPhoneNumberRequests(baseUrl: string, doFetch: typeof fetch = fetch): PhoneNumberRequests {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    list: async (accessToken, locationId) => {
      const query = new URLSearchParams({ pageSize: String(PAGE_SIZE), page: "0" });
      try {
        return await doFetch(`${base}/phone-system/numbers/location/${encodeURIComponent(locationId)}?${query}`, {
          method: "GET",
          headers: { authorization: `Bearer ${accessToken}`, version: PHONE_API_VERSION, accept: "application/json" },
          // A redirect could carry the bearer token to another host.
          redirect: "error",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new HighLevelHttpError("HighLevel phone read could not reach HighLevel.", null);
      }
    },
  };
}

// Keeps the number and its name only, for numbers that can text. A full page may have more behind it.
export function parsePhoneNumbers(json: unknown): { numbers: HighLevelPhoneNumber[]; complete: boolean } {
  const top = record(json);
  if (!top) throw new PhoneShapeError("not-object");
  const statusCode = typeof top.statusCode === "number" ? top.statusCode : null;
  if (statusCode === 401 || statusCode === 403) throw new BodyAccessError(statusCode);
  // HighLevel's v3 docs wrap the list in `data`; the older OpenAPI shows it flat. Both are read.
  const data = record(top.data);
  const body = data && Array.isArray(data.numbers) ? data : top;
  if (!Array.isArray(body.numbers)) {
    if (!saysNoNumbers(top, statusCode)) throw new PhoneShapeError(`no-numbers-list keys=${keyNames(body)}`);
    if (top.accountStatus !== undefined && top.accountStatus !== "active") throw new InactiveAccountError();
    return { numbers: [], complete: true };
  }
  const accountStatus = body.accountStatus !== undefined ? body.accountStatus : top.accountStatus;
  if (accountStatus !== undefined && accountStatus !== "active") throw new InactiveAccountError();
  const numbers: HighLevelPhoneNumber[] = [];
  for (const raw of body.numbers as unknown[]) {
    const row = record(raw);
    const number = text(row?.phoneNumber);
    if (number && record(row?.capabilities)?.sms === true) numbers.push({ number, name: text(row?.friendlyName) });
  }
  const pageSize = typeof body.pageSize === "number" && body.pageSize > 0 ? body.pageSize : PAGE_SIZE;
  return { numbers, complete: body.numbers.length < pageSize };
}

async function readBody(response: Response): Promise<unknown> {
  // No body at all is the same answer as an empty one: nothing to parse.
  if (!response.body) throw new PhoneShapeError("not-json");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new PhoneShapeError("too-large");
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(body + decoder.decode());
  } catch {
    throw new PhoneShapeError("not-json");
  }
}

function failureOf(status: number | null): PhoneNumbersFailure {
  if (status === 401 || status === 403) return "no-access";
  return status === 404 ? "not-connected" : "unavailable";
}

// Logs hold the step and the status only, never a number, a token or a body.
export async function readPhoneNumbers(deps: ReadDeps, tenantId: string): Promise<PhoneNumbersRead> {
  try {
    const locationId = await deps.readLocationId(tenantId);
    if (!locationId) return { ok: false, reason: "not-connected" };
    const response = await deps.withToken(tenantId, (token) => deps.requests.list(token, locationId));
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      console.error(`HighLevel phone read failed: step=request status=${response.status}`);
      return { ok: false, reason: failureOf(response.status) };
    }
    return { ok: true, ...parsePhoneNumbers(await readBody(response)) };
  } catch (error) {
    if (error instanceof InactiveAccountError) return { ok: false, reason: "inactive" };
    const step =
      error instanceof TokenServiceError
        ? `token code=${error.code}`
        : error instanceof HighLevelHttpError
          ? `request status=${error.status ?? "none"}`
          : error instanceof PhoneShapeError
            ? `parse detail=${error.detail}`
            : "parse";
    console.error(`HighLevel phone read failed: step=${step}`);
    return { ok: false, reason: error instanceof BodyAccessError ? "no-access" : "unavailable" };
  }
}

function defaultRuntime(): PhoneNumbersRuntime {
  const env = parseEnv("highlevel");
  const tokens = getTokenService();
  return {
    readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    // Never a forced refresh: a 401 here can mean a missing scope, and must not rotate a healthy token.
    withLocationToken: async (id, call) => call(await tokens.getLocationToken(id)),
    withStoredLocationToken,
    requests: createPhoneNumberRequests(env.GHL_API_BASE_URL),
  };
}

// The read behind a limit, counted before any env, token or HighLevel call. A limiter failure denies
// it. With `viewer` (an admin's client view) the stored token is used and the count is the viewer's.
export function buildPhoneNumbersReader(runtime: () => PhoneNumbersRuntime, hit: Hit, viewer?: { viewerId: string }) {
  return async (tenantId: string): Promise<PhoneNumbersRead> => {
    const key = viewer ? `highlevel-phone-numbers-view:${viewer.viewerId}` : `highlevel-phone-numbers:${tenantId}`;
    try {
      if (!(await hit(key, PHONE_READS_PER_MINUTE, READ_WINDOW_MS, new Date()))) return { ok: false, reason: "unavailable" };
    } catch {
      console.error("HighLevel phone read failed: step=limiter");
      return { ok: false, reason: "unavailable" };
    }
    let rt: PhoneNumbersRuntime;
    try {
      rt = runtime();
    } catch {
      console.error("HighLevel phone read failed: step=env");
      return { ok: false, reason: "unavailable" };
    }
    return readPhoneNumbers({ readLocationId: rt.readLocationId, withToken: viewer ? rt.withStoredLocationToken : rt.withLocationToken, requests: rt.requests }, tenantId);
  };
}

export function createTenantPhoneNumbersReader(hit: Hit, viewer?: { viewerId: string }) {
  return buildPhoneNumbersReader(defaultRuntime, hit, viewer);
}
