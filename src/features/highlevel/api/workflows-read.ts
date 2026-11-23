import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { HighLevelHttpError } from "./client";
import { getTokenService } from "./routes";
import { withStoredLocationToken } from "./stored-token";
import { TokenServiceError } from "./token-service";

// Read-only workflow list. `POST /workflows/search` is documented as a read, not independently
// confirmed, and it is the only call in this file. Contract from HighLevel's public docs page for this
// endpoint. It is NOT in the OpenAPI files at commit 0af86a4, which list only the deprecated
// `GET /workflows/`. No live call was made.
const WORKFLOWS_API_VERSION = "v3";
const NOT_ENABLED_CODE = "WORKFLOW_API_NOT_ENABLED_FOR_LOCATION";
const REQUEST_TIMEOUT_MS = 10_000;
const READ_WINDOW_MS = 60_000;
const MAX_ERROR_BODY_BYTES = 64 * 1024;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;

// Proposals, not measured numbers. The page size is the documented default; no maximum is stated.
export const WORKFLOWS_PAGE_SIZE = 20;
export const WORKFLOWS_MAX_PAGES = 10;
export const WORKFLOWS_READS_PER_MINUTE = 10;
export const WORKFLOWS_READ_DEADLINE_MS = 25_000;
export const MAX_WORKFLOWS_RESPONSE_BYTES = 2 * 1024 * 1024;

export type HighLevelWorkflow = { id: string; name: string | null; status: string | null };
export type WorkflowsRead =
  | { ok: true; workflows: HighLevelWorkflow[]; dropped: number; foreign: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" | "not-enabled" };

type Cursor = Array<string | number>;
type WithToken = (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
export type WorkflowRequests = {
  search: (accessToken: string, locationId: string, searchAfter?: Cursor) => Promise<Response>;
  // The same requests, also aborted by `deadline`.
  withDeadline?: (deadline: AbortSignal) => WorkflowRequests;
};
type ReadDeps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  withToken: WithToken;
  requests: WorkflowRequests;
  // Asked before every page after the first; the first is charged before the read starts.
  chargePage?: () => Promise<boolean>;
};
export type WorkflowRuntime = {
  readLocationId: ReadDeps["readLocationId"];
  withLocationToken: WithToken;
  withStoredLocationToken: WithToken;
  requests: WorkflowRequests;
};
type Hit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;

class WorkflowsBodyTooLargeError extends Error {}
class WorkflowsNotEnabledError extends Error {}
class WorkflowsDeadlineError extends Error {}
class WorkflowsThrottledError extends Error {}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const unexpected = () => new Error("HighLevel workflow read returned an unexpected response.");
// Cut on a code unit, so a character split in two loses its orphaned first half.
const capName = (value: string | null) => (value === null ? null : value.slice(0, MAX_NAME_LENGTH).replace(/[\uD800-\uDBFF]$/, ""));

export function createWorkflowRequests(baseUrl: string, doFetch: typeof fetch = fetch): WorkflowRequests {
  const base = baseUrl.replace(/\/+$/, "");
  const build = (deadline?: AbortSignal): WorkflowRequests => ({
    search: async (accessToken, locationId, searchAfter) => {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      try {
        return await doFetch(`${base}/workflows/search?${new URLSearchParams({ locationId })}`, {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}`, version: WORKFLOWS_API_VERSION, accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ limit: WORKFLOWS_PAGE_SIZE, ...(searchAfter ? { searchAfter } : {}) }),
          // A redirect could carry the bearer token and the POST to another host.
          redirect: "error",
          signal: deadline ? AbortSignal.any([timeout, deadline]) : timeout,
        });
      } catch {
        throw new HighLevelHttpError("HighLevel workflow read could not reach HighLevel.", null);
      }
    },
    withDeadline: build,
  });
  return build();
}

// The cursor goes back exactly as it came. The docs type it as strings; numbers are kept as they are.
function parseCursor(value: unknown): Cursor | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v)))) throw unexpected();
  return value.length > 0 ? (value as Cursor) : null;
}

// Only what the page shows is kept. The documented row has no locationId, so a row is dropped as
// foreign only when it carries one; the location is otherwise enforced by the request and the token.
// `foreign` counts those rows on the whole page, also past the page size, and they stay in `dropped`.
export function parseWorkflowSearch(json: unknown, locationId: string) {
  const body = record(json);
  const list = body?.workflows;
  if (!Array.isArray(list)) throw unexpected();
  const searchAfter = parseCursor(body?.searchAfter);
  const isForeign = (raw: unknown) => {
    const row = record(raw);
    // A null names no location, so it is treated like the documented row that has none.
    return row !== null && row.locationId !== undefined && row.locationId !== null && row.locationId !== locationId;
  };
  const workflows: HighLevelWorkflow[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of list.slice(0, WORKFLOWS_PAGE_SIZE)) {
    const row = record(raw);
    const id = text(row?.id);
    if (!row || !id || id.length > MAX_ID_LENGTH || seen.has(id) || isForeign(row)) dropped += 1;
    else {
      seen.add(id);
      workflows.push({ id, name: capName(text(row.name)), status: text(row.status) });
    }
  }
  const total = typeof body?.total === "number" && Number.isFinite(body.total) ? body.total : null;
  return { workflows, dropped, foreign: list.filter(isForeign).length, searchAfter, total, received: list.length, truncated: list.length > WORKFLOWS_PAGE_SIZE };
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new WorkflowsBodyTooLargeError();
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
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new WorkflowsBodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

// The docs do not say where the error body holds this code, so the whole (capped) body is searched.
async function isNotEnabled(response: Response): Promise<boolean> {
  try {
    return (await readLimitedText(response, MAX_ERROR_BODY_BYTES)).includes(NOT_ENABLED_CODE);
  } catch {
    return false;
  }
}

async function readPage(deps: ReadDeps, requests: WorkflowRequests, tenantId: string, locationId: string, cursor?: Cursor): Promise<unknown> {
  const response = await deps.withToken(tenantId, (token) => (cursor ? requests.search(token, locationId, cursor) : requests.search(token, locationId)));
  if (response.status === 403 && (await isNotEnabled(response))) throw new WorkflowsNotEnabledError();
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new HighLevelHttpError("HighLevel workflow read failed.", response.status);
  }
  return JSON.parse(await readLimitedText(response, MAX_WORKFLOWS_RESPONSE_BYTES));
}

// Logs hold the step and the status only, never a row, an id, a token or a response body.
function failure(error: unknown): Extract<WorkflowsRead, { ok: false }> {
  if (error instanceof WorkflowsNotEnabledError) {
    console.warn("HighLevel workflow read stopped: step=not-enabled status=403");
    return { ok: false, reason: "not-enabled" };
  }
  if (error instanceof TokenServiceError) {
    console.error(`HighLevel workflow read failed: step=token code=${error.code}`);
    return { ok: false, reason: error.code === "unavailable" ? "unavailable" : "reconnect" };
  }
  if (error instanceof HighLevelHttpError) {
    console.error(`HighLevel workflow read failed: step=request status=${error.status ?? "none"}`);
    return { ok: false, reason: error.status === 401 || error.status === 403 ? "reconnect" : "unavailable" };
  }
  const step = error instanceof WorkflowsDeadlineError ? "deadline" : error instanceof WorkflowsThrottledError ? "throttled" : error instanceof WorkflowsBodyTooLargeError ? "size" : "parse";
  console.error(`HighLevel workflow read failed: step=${step}`);
  return { ok: false, reason: "unavailable" };
}

async function readAllPages(deps: ReadDeps, tenantId: string, deadline: AbortSignal): Promise<WorkflowsRead> {
  const locationId = await deps.readLocationId(tenantId);
  if (!locationId) return { ok: false, reason: "reconnect" };
  const requests = deps.requests.withDeadline?.(deadline) ?? deps.requests;
  const workflows: HighLevelWorkflow[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: Cursor | undefined;
  let dropped = 0;
  let foreign = 0;
  let received = 0;
  let complete = false;
  for (let n = 0; n < WORKFLOWS_MAX_PAGES; n += 1) {
    if (deadline.aborted) throw new WorkflowsDeadlineError();
    if (n > 0 && deps.chargePage && !(await deps.chargePage().catch(() => false))) throw new WorkflowsThrottledError();
    const page = parseWorkflowSearch(await readPage(deps, requests, tenantId, locationId, cursor), locationId);
    dropped += page.dropped;
    foreign += page.foreign;
    received += page.received;
    for (const row of page.workflows) {
      if (seen.has(row.id)) dropped += 1;
      else {
        seen.add(row.id);
        workflows.push(row);
      }
    }
    if (page.truncated) break;
    if (!page.searchAfter || page.received === 0) {
      // Without a total, only a short page shows the list ended.
      complete = page.total === null ? page.received < WORKFLOWS_PAGE_SIZE : page.total === received;
      break;
    }
    const key = JSON.stringify(page.searchAfter);
    if (cursors.has(key)) break;
    cursors.add(key);
    cursor = page.searchAfter;
  }
  return { ok: true, workflows, dropped, foreign, complete };
}

// All pages or a failure state, within one deadline shared by every page. No retry on a 429.
// `complete` is false when the list may be short.
export async function readWorkflows(deps: ReadDeps, tenantId: string): Promise<WorkflowsRead> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new WorkflowsDeadlineError());
      controller.abort();
    }, WORKFLOWS_READ_DEADLINE_MS);
  });
  try {
    return await Promise.race([readAllPages(deps, tenantId, controller.signal), expired]);
  } catch (error) {
    return failure(error);
  } finally {
    clearTimeout(timer);
  }
}

function defaultRuntime(): WorkflowRuntime {
  const env = parseEnv("highlevel");
  const tokens = getTokenService();
  return {
    readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    withLocationToken: tokens.withLocationToken,
    withStoredLocationToken,
    requests: createWorkflowRequests(env.GHL_API_BASE_URL),
  };
}

// The read behind a limit, counted before any env, token or HighLevel call; a limiter failure denies
// it. With `viewer` (an admin's read-only client view) the stored token is used, nothing is refreshed,
// and the count is the viewer's. This limit counts HighLevel page fetches, so one long list uses
// several; a read that reaches the limit part way returns unavailable.
export function buildWorkflowsReader(runtime: () => WorkflowRuntime, hit: Hit, viewer?: { viewerId: string }) {
  return async (tenantId: string): Promise<WorkflowsRead> => {
    const key = viewer ? `highlevel-workflows-view:${viewer.viewerId}` : `highlevel-workflows:${tenantId}`;
    const chargePage = () => hit(key, WORKFLOWS_READS_PER_MINUTE, READ_WINDOW_MS, new Date());
    let allowed: boolean;
    try {
      allowed = await chargePage();
    } catch {
      console.error("HighLevel workflow read failed: step=limiter");
      return { ok: false, reason: "unavailable" };
    }
    if (!allowed) {
      console.error("HighLevel workflow read failed: step=throttled");
      return { ok: false, reason: "unavailable" };
    }
    let rt: WorkflowRuntime;
    try {
      rt = runtime();
    } catch {
      console.error("HighLevel workflow read failed: step=env");
      return { ok: false, reason: "unavailable" };
    }
    return readWorkflows({ readLocationId: rt.readLocationId, withToken: viewer ? rt.withStoredLocationToken : rt.withLocationToken, requests: rt.requests, chargePage }, tenantId);
  };
}

export function createTenantWorkflowsReader(hit: Hit, viewer?: { viewerId: string }) {
  return buildWorkflowsReader(defaultRuntime, hit, viewer);
}
