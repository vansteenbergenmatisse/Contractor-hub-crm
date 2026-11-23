import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { HighLevelHttpError } from "./client";
import { getTokenService } from "./routes";
import { withStoredLocationToken } from "./stored-token";
import { TokenServiceError } from "./token-service";

// Read-only quotes wiring: one GET path, GET /invoices/estimate/list (scope invoices/estimate.readonly).
// Source: apps/invoices.json at commit 0af86a4. No live call has been made. That file types each list
// item as a string, so the row fields below are taken from its EstimateResponseDto and are UNVERIFIED.
// `status` is not in that DTO: only the list endpoint's documented filter values are accepted.
const ESTIMATES_API_VERSION = "2021-07-28"; // the only value the OpenAPI file lists for this path
const REQUEST_TIMEOUT_MS = 10_000;
const ESTIMATES_READ_DEADLINE_MS = 25_000; // one budget for the whole read, across all pages
const MAX_NAME_LENGTH = 200;
const ESTIMATES_READ_WINDOW_MS = 60_000;
const STATUSES = ["draft", "sent", "viewed", "accepted", "declined", "invoiced"] as const;

// Proposals, not measured numbers. No maximum `limit` is stated. One page load costs up to 3 calls.
export const ESTIMATES_PAGE_SIZE = 100;
export const ESTIMATES_MAX_PAGES = 3;
export const ESTIMATES_READS_PER_MINUTE = 20;
export const MAX_ESTIMATES_RESPONSE_BYTES = 5 * 1024 * 1024;

export type EstimateStatus = (typeof STATUSES)[number];
// `amount` is the number as received. Its unit (cents or whole currency) is not documented.
// `issuedMs` is UTC midnight of the calendar day written in the source, so no timezone can shift it.
export type EstimateRow = {
  id: string;
  name: string | null;
  contactName: string | null;
  status: EstimateStatus | null;
  amount: number | null;
  currency: string | null;
  issuedMs: number | null;
};
export type EstimatesRead =
  | { ok: true; rows: EstimateRow[]; total: number; dropped: number; foreign?: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" };

type WithToken = (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
type EstimatesQuery = { locationId: string; limit: number; offset: number };
export type EstimatesRequests = { list: (accessToken: string, query: EstimatesQuery, signal?: AbortSignal) => Promise<Response> };
type ReadDeps = { readLocationId: (tenantId: string) => Promise<string | null>; withToken: WithToken; requests: EstimatesRequests };
export type EstimatesRuntime = {
  readLocationId: ReadDeps["readLocationId"];
  withLocationToken: WithToken;
  withStoredLocationToken: WithToken;
  requests: EstimatesRequests;
};
type Hit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;

class EstimatesBodyTooLargeError extends Error {}
class EstimatesDeadlineError extends Error {}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const boundedName = (value: unknown): string | null => {
  const name = text(value);
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
};
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const unexpected = () => new Error("HighLevel estimates read returned an unexpected response.");

export function createEstimatesRequests(baseUrl: string, doFetch: typeof fetch = fetch): EstimatesRequests {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    list: async (accessToken, q, deadline) => {
      const query = new URLSearchParams({ altId: q.locationId, altType: "location", limit: String(q.limit), offset: String(q.offset) });
      try {
        return await doFetch(`${base}/invoices/estimate/list?${query}`, {
          method: "GET",
          headers: { authorization: `Bearer ${accessToken}`, version: ESTIMATES_API_VERSION, accept: "application/json" },
          signal: deadline ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), deadline]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new HighLevelHttpError("HighLevel estimates read could not reach HighLevel.", null);
      }
    },
  };
}

const amountOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const currencyOf = (value: unknown): string | null => (typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null);
const statusOf = (value: unknown): EstimateStatus | null => STATUSES.find((status) => status === value) ?? null;

// A date without a zone cannot be placed safely, so it counts as missing. The day shown is the one
// written in the source (its validated YYYY-MM-DD prefix), never one recomputed through a timezone.
function issuedDay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const source = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(source);
  if (!match || !/(Z|[+-]\d{2}:?\d{2})$/i.test(source) || Number.isNaN(Date.parse(source))) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null;
}

// Only what the page shows is kept: no contact email, phone or id, no line items, no notes. A row must
// name this location in `altId` (the DTO marks it required), so a row that cannot be placed is dropped.
// `foreign` is the part of `dropped` that names another location or owner type. `ids` holds every id on
// the page, including deleted and dropped rows, so the caller can check the page against the total.
export function parseEstimatePage(json: unknown, locationId: string): { rows: EstimateRow[]; ids: string[]; total: number; seen: number; dropped: number; foreign: number } {
  const body = record(json);
  const list = body?.estimates;
  const total = body?.total;
  if (!Array.isArray(list) || typeof total !== "number" || !Number.isSafeInteger(total) || total < 0 || list.length > total) throw unexpected();
  const page = list.slice(0, ESTIMATES_PAGE_SIZE);
  const rows: EstimateRow[] = [];
  const ids: string[] = [];
  let dropped = 0;
  let foreign = 0;
  for (const raw of page) {
    const row = record(raw);
    const id = text(row?._id);
    if (id) ids.push(id);
    if (!row || !id || row.altId !== locationId || (row.altType !== undefined && row.altType !== "location")) {
      dropped += 1;
      if (row && ((text(row.altId) !== null && row.altId !== locationId) || (row.altType !== undefined && row.altType !== "location"))) foreign += 1;
      continue;
    }
    if (row.deleted === true) continue;
    rows.push({
      id,
      name: boundedName(row.name),
      contactName: boundedName(record(row.contactDetails)?.name),
      status: statusOf(row.status),
      amount: amountOf(row.total),
      currency: currencyOf(row.currency),
      issuedMs: issuedDay(row.issueDate),
    });
  }
  return { rows, ids, total, seen: page.length, dropped, foreign };
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ESTIMATES_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new EstimatesBodyTooLargeError();
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
    if (size > MAX_ESTIMATES_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new EstimatesBodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

// Logs hold the step and the status only, never a row, an id, a token or a response body.
function failure(error: unknown): { ok: false; reason: "reconnect" | "unavailable" } {
  if (error instanceof TokenServiceError) {
    console.error(`HighLevel estimates read failed: step=token code=${error.code}`);
    return { ok: false, reason: error.code === "unavailable" ? "unavailable" : "reconnect" };
  }
  if (error instanceof HighLevelHttpError) {
    console.error(`HighLevel estimates read failed: step=request status=${error.status ?? "none"}`);
    return { ok: false, reason: error.status === 401 || error.status === 403 ? "reconnect" : "unavailable" };
  }
  const step = error instanceof EstimatesDeadlineError ? "deadline" : error instanceof EstimatesBodyTooLargeError ? "size" : "parse";
  console.error(`HighLevel estimates read failed: step=${step}`);
  return { ok: false, reason: "unavailable" };
}

// All or nothing per load: a page that fails fails the read. No retry on a 429. `complete` is true only
// when the unique ids read (deleted and dropped rows included) equal the total and no id repeated.
async function readPages(deps: ReadDeps, tenantId: string, signal: AbortSignal): Promise<EstimatesRead> {
  const locationId = await deps.readLocationId(tenantId);
  if (!locationId) return { ok: false, reason: "reconnect" };
  const rows: EstimateRow[] = [];
  const shown = new Set<string>();
  const counted = new Set<string>();
  let repeated = false;
  let dropped = 0;
  let foreign = 0;
  let seen = 0;
  let total = 0;
  for (let p = 0; p < ESTIMATES_MAX_PAGES; p += 1) {
    if (signal.aborted) throw new EstimatesDeadlineError();
    const offset = p * ESTIMATES_PAGE_SIZE;
    const response = await deps.withToken(tenantId, async (token) => {
      if (signal.aborted) throw new EstimatesDeadlineError();
      return deps.requests.list(token, { locationId, limit: ESTIMATES_PAGE_SIZE, offset }, signal);
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new HighLevelHttpError("HighLevel estimates read failed.", response.status);
    }
    const page = parseEstimatePage(await readLimitedJson(response), locationId);
    total = page.total;
    seen += page.seen;
    dropped += page.dropped;
    foreign += page.foreign;
    for (const id of page.ids) {
      if (counted.has(id)) repeated = true;
      counted.add(id);
    }
    for (const row of page.rows) {
      if (shown.has(row.id)) continue;
      shown.add(row.id);
      rows.push(row);
    }
    if (seen >= total || page.seen < ESTIMATES_PAGE_SIZE) break;
  }
  return { ok: true, rows, total, dropped, foreign, complete: !repeated && counted.size === total };
}

// One deadline covers the location lookup, the token and every page. When it expires the open request
// is aborted, no further page starts, and the read is unavailable.
export async function readEstimates(deps: ReadDeps, tenantId: string): Promise<EstimatesRead> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new EstimatesDeadlineError());
      controller.abort();
    }, ESTIMATES_READ_DEADLINE_MS);
  });
  try {
    return await Promise.race([readPages(deps, tenantId, controller.signal), expired]);
  } catch (error) {
    return failure(error);
  } finally {
    clearTimeout(timer);
  }
}

function defaultRuntime(): EstimatesRuntime {
  const env = parseEnv("highlevel");
  const tokens = getTokenService();
  return {
    readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    withLocationToken: tokens.withLocationToken,
    withStoredLocationToken,
    requests: createEstimatesRequests(env.GHL_API_BASE_URL),
  };
}

// The read behind a limit, counted before any env, token or HighLevel call; a limiter failure denies
// it. With `viewer` (an admin's read-only client view) the stored token is used, nothing is refreshed,
// and the count is the viewer's.
export function buildEstimatesReader(runtime: () => EstimatesRuntime, hit: Hit, viewer?: { viewerId: string }) {
  return async (tenantId: string): Promise<EstimatesRead> => {
    const key = viewer ? `highlevel-estimates-view:${viewer.viewerId}` : `highlevel-estimates:${tenantId}`;
    let allowed: boolean;
    try {
      allowed = await hit(key, ESTIMATES_READS_PER_MINUTE, ESTIMATES_READ_WINDOW_MS, new Date());
    } catch {
      console.error("HighLevel estimates read failed: step=limiter");
      return { ok: false, reason: "unavailable" };
    }
    if (!allowed) {
      console.error("HighLevel estimates read failed: step=throttled");
      return { ok: false, reason: "unavailable" };
    }
    let rt: EstimatesRuntime;
    try {
      rt = runtime();
    } catch {
      console.error("HighLevel estimates read failed: step=env");
      return { ok: false, reason: "unavailable" };
    }
    return readEstimates({ readLocationId: rt.readLocationId, withToken: viewer ? rt.withStoredLocationToken : rt.withLocationToken, requests: rt.requests }, tenantId);
  };
}

export function createTenantEstimatesReader(hit: Hit, viewer?: { viewerId: string }) {
  return buildEstimatesReader(defaultRuntime, hit, viewer);
}
