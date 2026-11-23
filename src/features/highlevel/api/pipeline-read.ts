import { HighLevelHttpError } from "./client";
import { TokenServiceError } from "./token-service";

// Read-only adapter for pipelines, stages and open opportunities. It sends GET requests only: a stage
// change can fire a HighLevel workflow, so nothing here can write. Shapes come from the public OpenAPI
// file and have not been seen on a real answer (docs/greenlane/hl-api-notes.md).

// The only Version the OpenAPI file lists for these two paths.
const PIPELINE_API_VERSION = "2021-07-28";
const REQUEST_TIMEOUT_MS = 10_000;
// The documented maximum per page.
export const PIPELINE_PAGE_SIZE = 100;
// Proposal, not a measured number: at most 300 open deals per load, then the page says it is cut off.
export const PIPELINE_MAX_PAGES = 3;
// Proposal, not a measured number: reads per tenant (or viewer) per minute.
export const PIPELINE_READS_PER_MINUTE = 60;
const PIPELINE_READ_WINDOW_MS = 60_000;
// Proposal, not a measured number: the same limit as a page of contacts.
export const MAX_PIPELINE_RESPONSE_BYTES = 5 * 1024 * 1024;

export type HighLevelPipelineStage = { id: string; name: string };
export type HighLevelPipeline = { id: string; name: string; stages: HighLevelPipelineStage[] };
// No phone, email or other contact field is carried past the parser.
export type HighLevelOpportunity = {
  id: string;
  name: string | null;
  contactName: string | null;
  stageId: string;
  monetaryValue: number | null;
  lastStageChangeAt: string | null;
};
export type PipelineBoardRead =
  | { ok: true; pipelines: HighLevelPipeline[]; pipelineId: string | null; opportunities: HighLevelOpportunity[]; dropped: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" };
export type OpportunityQuery = { locationId: string; pipelineId: string; page: number; limit: number };

class PipelineBodyTooLargeError extends Error {}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function createPipelineRequests(options: { baseUrl: string; fetch?: (url: string, init: RequestInit) => Promise<Response> }) {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init));
  async function get(path: string, params: Record<string, string>, accessToken: string): Promise<Response> {
    try {
      return await doFetch(`${base}${path}?${new URLSearchParams(params)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}`, version: PIPELINE_API_VERSION, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel pipeline read could not be reached.", null);
    }
  }
  return {
    requestPipelines: (accessToken: string, locationId: string) => get("/opportunities/pipelines", { locationId }, accessToken),
    // The OpenAPI file names this path's parameters in snake_case, unlike the pipelines path.
    requestOpportunities: (accessToken: string, query: OpportunityQuery) =>
      get("/opportunities/search", { location_id: query.locationId, pipeline_id: query.pipelineId, status: "open", page: String(query.page), limit: String(query.limit) }, accessToken),
  };
}

function parseStages(raw: unknown): { stages: HighLevelPipelineStage[]; dropped: number } {
  if (!Array.isArray(raw)) return { stages: [], dropped: 0 };
  const rows: (HighLevelPipelineStage & { position: number | null })[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const entry of raw) {
    const id = isRecord(entry) ? text(entry.id) : null;
    const name = isRecord(entry) ? text(entry.name) : null;
    if (!id || !name || seen.has(id)) {
      dropped += 1;
      continue;
    }
    seen.add(id);
    const position = (entry as Record<string, unknown>).position;
    rows.push({ id, name, position: typeof position === "number" && Number.isFinite(position) ? position : null });
  }
  // Sorted only when every stage states its position; otherwise the answer's order stands.
  if (rows.every((s) => s.position !== null)) rows.sort((a, b) => a.position! - b.position!);
  return { stages: rows.map(({ id, name }) => ({ id, name })), dropped };
}

// The tenant's own pipelines and stages. A malformed entry is dropped and counted. Throws when the
// answer has no pipelines list.
export function parsePipelines(json: unknown, locationId: string): { pipelines: HighLevelPipeline[]; dropped: number } {
  if (!isRecord(json) || !Array.isArray(json.pipelines)) throw new Error("HighLevel pipelines returned an unexpected response.");
  const pipelines: HighLevelPipeline[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of json.pipelines) {
    if (!isRecord(raw)) {
      dropped += 1;
      continue;
    }
    const id = text(raw.id);
    const name = text(raw.name);
    const parsed = parseStages(raw.stages);
    const foreign = raw.locationId !== undefined && raw.locationId !== locationId;
    if (!id || !name || foreign || seen.has(id) || parsed.stages.length === 0) {
      dropped += 1;
      continue;
    }
    seen.add(id);
    dropped += parsed.dropped;
    pipelines.push({ id, name, stages: parsed.stages });
  }
  return { pipelines, dropped };
}

function parseOpportunity(raw: unknown, locationId: string, pipeline: HighLevelPipeline): HighLevelOpportunity | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id);
  const stageId = text(raw.pipelineStageId);
  if (!id || !stageId || !pipeline.stages.some((s) => s.id === stageId)) return null;
  if (raw.locationId !== undefined && raw.locationId !== locationId) return null;
  if (raw.pipelineId !== undefined && raw.pipelineId !== pipeline.id) return null;
  if (raw.status !== undefined && raw.status !== "open") return null;
  const changed = text(raw.lastStageChangeAt);
  const value = raw.monetaryValue;
  return {
    id,
    name: text(raw.name),
    contactName: isRecord(raw.contact) ? text(raw.contact.name) : null,
    stageId,
    monetaryValue: typeof value === "number" && Number.isFinite(value) ? value : null,
    lastStageChangeAt: changed && !Number.isNaN(Date.parse(changed)) ? changed : null,
  };
}

// One page of opportunities. `more`: the next page can be asked for. `complete`: nothing lies beyond
// this page. `receivedBefore` counts the rows of earlier pages, to compare with `meta.total`.
export function parseOpportunityPage(json: unknown, locationId: string, pipeline: HighLevelPipeline, page: number, limit: number, receivedBefore: number) {
  if (!isRecord(json) || !Array.isArray(json.opportunities)) throw new Error("HighLevel opportunities returned an unexpected response.");
  const rows: HighLevelOpportunity[] = [];
  let dropped = 0;
  for (const raw of json.opportunities.slice(0, limit)) {
    const row = parseOpportunity(raw, locationId, pipeline);
    if (row) rows.push(row);
    else dropped += 1;
  }
  const received = json.opportunities.length;
  const meta = isRecord(json.meta) ? json.meta : {};
  const more = received <= limit && meta.nextPage === page + 1;
  const total = typeof meta.total === "number" ? meta.total : null;
  const complete = !more && received <= limit && (total !== null ? total <= receivedBefore + received : received < limit);
  return { rows, dropped, more, complete, received };
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PIPELINE_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new PipelineBodyTooLargeError();
  }
  if (!response.body) throw new Error("HighLevel pipeline read returned no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PIPELINE_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new PipelineBodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

async function okJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new HighLevelHttpError("HighLevel pipeline read failed.", response.status);
  }
  return readLimitedJson(response);
}

// Logs hold the step and the status only, never a row, a token or a response body.
function failure(error: unknown): PipelineBoardRead {
  if (error instanceof TokenServiceError) {
    console.error(`HighLevel pipeline read failed: step=token code=${error.code}`);
    return { ok: false, reason: error.code === "unavailable" ? "unavailable" : "reconnect" };
  }
  if (error instanceof HighLevelHttpError) {
    console.error(`HighLevel pipeline read failed: step=request status=${error.status ?? "none"}`);
    return { ok: false, reason: error.status === 401 || error.status === 403 ? "reconnect" : "unavailable" };
  }
  console.error(`HighLevel pipeline read failed: step=${error instanceof PipelineBodyTooLargeError ? "size" : "parse"}`);
  return { ok: false, reason: "unavailable" };
}

type WithToken = (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;

export type PipelineBoardDeps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  withToken: WithToken;
  requestPipelines: (accessToken: string, locationId: string) => Promise<Response>;
  requestOpportunities: (accessToken: string, query: OpportunityQuery) => Promise<Response>;
};

// The ids are looked up per tenant on every load. A requested pipeline counts only when this tenant
// has it, so a pipeline id from the URL can never reach another tenant's data. A 429 is not retried
// during a page render; the only retry is the token path's own.
export async function readPipelineBoard(deps: PipelineBoardDeps, tenantId: string, requestedPipelineId?: string): Promise<PipelineBoardRead> {
  try {
    const locationId = await deps.readLocationId(tenantId);
    if (!locationId) return { ok: false, reason: "reconnect" };
    const listed = parsePipelines(await okJson(await deps.withToken(tenantId, (token) => deps.requestPipelines(token, locationId))), locationId);
    const pipeline = listed.pipelines.find((p) => p.id === requestedPipelineId) ?? listed.pipelines[0];
    if (!pipeline) return { ok: true, pipelines: [], pipelineId: null, opportunities: [], dropped: listed.dropped, complete: true };

    const opportunities: HighLevelOpportunity[] = [];
    const seen = new Set<string>();
    let dropped = listed.dropped;
    let received = 0;
    let complete = false;
    for (let page = 1; page <= PIPELINE_MAX_PAGES; page += 1) {
      const query = { locationId, pipelineId: pipeline.id, page, limit: PIPELINE_PAGE_SIZE };
      const json = await okJson(await deps.withToken(tenantId, (token) => deps.requestOpportunities(token, query)));
      const parsed = parseOpportunityPage(json, locationId, pipeline, page, PIPELINE_PAGE_SIZE, received);
      received += parsed.received;
      dropped += parsed.dropped;
      for (const row of parsed.rows) {
        if (seen.has(row.id)) dropped += 1;
        else {
          seen.add(row.id);
          opportunities.push(row);
        }
      }
      complete = parsed.complete;
      if (!parsed.more) break;
    }
    return { ok: true, pipelines: listed.pipelines, pipelineId: pipeline.id, opportunities, dropped, complete };
  } catch (error) {
    return failure(error);
  }
}

export type PipelineServices = Omit<PipelineBoardDeps, "withToken"> & {
  withLocationToken: WithToken;
  // Never refreshes or writes: the path for an admin's read-only look at a client.
  withStoredLocationToken: WithToken;
};

export type PipelineRateLimit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;

// The limiter runs first, before env, token or HighLevel, and fails closed. With `viewer` set (an
// admin's client view) the read uses the stored token only and counts against the admin, so it
// neither refreshes the client's token nor spends the client's quota.
export function createPipelineReaderFrom(getServices: () => PipelineServices, hit: PipelineRateLimit, viewer?: { viewerId: string }) {
  return async (tenantId: string, pipelineId?: string): Promise<PipelineBoardRead> => {
    const key = viewer ? `highlevel-pipeline-view:${viewer.viewerId}` : `highlevel-pipeline:${tenantId}`;
    let allowed: boolean;
    try {
      allowed = await hit(key, PIPELINE_READS_PER_MINUTE, PIPELINE_READ_WINDOW_MS, new Date());
    } catch {
      console.error("HighLevel pipeline read failed: step=limiter");
      return { ok: false, reason: "unavailable" };
    }
    if (!allowed) {
      console.error("HighLevel pipeline read failed: step=throttled");
      return { ok: false, reason: "unavailable" };
    }
    let services: PipelineServices;
    try {
      services = getServices();
    } catch {
      console.error("HighLevel pipeline read failed: step=env");
      return { ok: false, reason: "unavailable" };
    }
    const { withLocationToken, withStoredLocationToken, ...rest } = services;
    return readPipelineBoard({ ...rest, withToken: viewer ? withStoredLocationToken : withLocationToken }, tenantId, pipelineId);
  };
}
