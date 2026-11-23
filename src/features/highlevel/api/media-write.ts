import { TokenServiceError } from "./token-service";

// The media library calls of Settings' Change image. Contract: OpenAPI `apps/medias.json` and
// `apps/v3/medias-v3.json` at commit 0af86a4; no real response has been seen. A file is only ever moved
// to the recoverable trash, by exact id: no permanent delete, rename or update exists here. Logs hold
// the step and status only.
const MAX_LIST_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 100;
// Proposals, not measured. A library that does not fit is reported, never half-checked.
// Each folder costs at least two calls per type, because only an empty page ends it.
const MAX_LIST_CALLS = 120;
const WALK_BUDGET_MS = 12_000;
const MAX_VERIFY_PAGES = 20;
const VERIFY_BUDGET_MS = 5_000;

export type MediaFile = { id: string; name: string; url: string; parentId: string | null };
// `files`: every live file holding the exact URL. `siblings`: other files with the same name in the
// same folder as the single match. `incomplete`: the whole library could not be read.
export type MediaFind =
  | { ok: true; files: MediaFile[]; siblings: MediaFile[] }
  | { ok: false; reason: "permission" | "connection" | "retry" | "incomplete" };
export type MediaUpload = { bytes: Uint8Array; name: string; fileName: string; contentType: string; parentId?: string | null };
// `no_answer`: a timeout, 5xx or unreadable 2xx, so the file may exist. It is never uploaded again blindly.
export type MediaUploadOutcome =
  | { kind: "uploaded"; fileId: string; url: string }
  | { kind: "rejected" | "permission" | "connection" | "retry" | "no_answer" };
// `unconfirmed`: the call may have landed. It is never repeated.
export type MediaTrashOutcome = "trashed" | "unconfirmed" | "failed" | "permission";

type ListPage = { type: "file" | "folder"; parentId: string | null; offset: number; limit: number };
export type MediaAdapterDeps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  getLocationToken: (tenantId: string) => Promise<string>;
  requestFiles: (accessToken: string, locationId: string, page: ListPage) => Promise<Response>;
  requestUpload: (accessToken: string, file: MediaUpload) => Promise<Response>;
  requestTrash: (accessToken: string, locationId: string, fileId: string) => Promise<Response>;
  now?: () => number;
};

class ListStop extends Error {
  constructor(readonly reason: "permission" | "retry" | "incomplete") {
    super(reason);
  }
}

const filled = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

// `gone`: a readable row of this location that is trashed or deleted.
type Row = { kind: "file"; id: string; file: MediaFile } | { kind: "folder"; id: string } | { kind: "gone"; id: string };

// Null: this row cannot be read, so a listing holding it cannot be called complete.
function parseRow(raw: unknown, locationId: string): Row | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (item.altId !== locationId || item.altType !== "location") return null;
  const id = filled(item._id) ? item._id : filled(item.id) ? item.id : null;
  if (!id) return null;
  if (item.deleted === true || item.status === "trashed" || item.status === "deleted") return { kind: "gone", id };
  if (item.type === "folder") return { kind: "folder", id };
  if (!filled(item.name) || !filled(item.url)) return null;
  return { kind: "file", id, file: { id, name: item.name, url: item.url, parentId: filled(item.parentId) ? item.parentId : null } };
}

async function readPage(deps: MediaAdapterDeps, token: string, locationId: string, page: ListPage): Promise<unknown[]> {
  const response = await deps.requestFiles(token, locationId, page);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    console.error(`HighLevel media list failed: status=${response.status}`);
    throw new ListStop(response.status === 401 || response.status === 403 ? "permission" : "retry");
  }
  const body = await response.text();
  if (body.length > MAX_LIST_BYTES) throw new ListStop("incomplete");
  const list = (JSON.parse(body) as Record<string, unknown> | null)?.files;
  if (!Array.isArray(list)) throw new Error("HighLevel media list returned an unexpected response.");
  return list;
}

// Every page of one folder and type. A server may cap a page below the limit, so the offset moves by
// what came back and only an empty page ends the folder. A page with nothing new means paging does
// not work, and a row that cannot be read may hide a file: neither can be called complete.
async function readFolder(deps: MediaAdapterDeps, token: string, locationId: string, type: "file" | "folder", parentId: string | null, spend: () => void, into: Map<string, Row>) {
  const seen = new Set<string>();
  for (let offset = 0; ; ) {
    spend();
    const list = await readPage(deps, token, locationId, { type, parentId, offset, limit: PAGE_SIZE });
    if (list.length === 0) return;
    let fresh = 0;
    for (const raw of list) {
      const row = parseRow(raw, locationId);
      if (!row) throw new ListStop("incomplete");
      if (!seen.has(row.id)) {
        seen.add(row.id);
        fresh += 1;
      }
      if (row.kind !== "gone") into.set(`${row.kind}:${row.id}`, row);
    }
    if (fresh === 0) throw new ListStop("incomplete");
    offset += list.length;
  }
}

function tokenReason(error: unknown): "connection" | "retry" {
  return error instanceof TokenServiceError && error.code !== "unavailable" ? "connection" : "retry";
}

function uploadKindOf(status: number): "rejected" | "permission" | "retry" | "no_answer" {
  if (status === 401 || status === 403) return "permission";
  if (status === 429) return "retry";
  if (status === 408 || status >= 500) return "no_answer";
  return "rejected";
}

export function createMediaAdapter(deps: MediaAdapterDeps) {
  const clock = deps.now ?? Date.now;
  return {
    // Walks every folder of the tenant's library and matches the URL exactly.
    async find(tenantId: string, url: string): Promise<MediaFind> {
      try {
        const locationId = await deps.readLocationId(tenantId);
        if (!locationId) return { ok: false, reason: "connection" };
        const token = await deps.getLocationToken(tenantId);
        const started = clock();
        let calls = 0;
        const spend = () => {
          calls += 1;
          if (calls > MAX_LIST_CALLS || clock() - started > WALK_BUDGET_MS) throw new ListStop("incomplete");
        };
        const rows = new Map<string, Row>();
        const queue: (string | null)[] = [null];
        const walked = new Set<string | null>();
        while (queue.length > 0) {
          const parent = queue.shift() as string | null;
          if (walked.has(parent)) continue;
          walked.add(parent);
          await readFolder(deps, token, locationId, "file", parent, spend, rows);
          await readFolder(deps, token, locationId, "folder", parent, spend, rows);
          for (const row of rows.values()) if (row.kind === "folder" && !walked.has(row.id)) queue.push(row.id);
        }
        const all = [...rows.values()].flatMap((row) => (row.kind === "file" ? [row.file] : []));
        const files = all.filter((file) => file.url === url);
        const only = files.length === 1 ? files[0] : null;
        const siblings = only ? all.filter((file) => file.id !== only.id && file.name === only.name && file.parentId === only.parentId) : [];
        return { ok: true, files, siblings };
      } catch (error) {
        if (error instanceof ListStop) return { ok: false, reason: error.reason };
        console.error("HighLevel media list failed: step=read");
        return { ok: false, reason: tokenReason(error) };
      }
    },

    // True only when the file's folder lists exactly this id with this URL and name.
    async verify(tenantId: string, file: MediaFile): Promise<boolean> {
      try {
        const locationId = await deps.readLocationId(tenantId);
        if (!locationId) return false;
        const token = await deps.getLocationToken(tenantId);
        const started = clock();
        const seen = new Set<string>();
        let offset = 0;
        for (let page = 0; page < MAX_VERIFY_PAGES && clock() - started <= VERIFY_BUDGET_MS; page += 1) {
          const list = await readPage(deps, token, locationId, { type: "file", parentId: file.parentId, offset, limit: PAGE_SIZE });
          if (list.length === 0) return false;
          let fresh = 0;
          for (const raw of list) {
            const row = parseRow(raw, locationId);
            if (!row) return false;
            if (!seen.has(row.id)) {
              seen.add(row.id);
              fresh += 1;
            }
            if (row.id === file.id) {
              return row.kind === "file" && row.file.url === file.url && row.file.name === file.name && row.file.parentId === file.parentId;
            }
          }
          if (fresh === 0) return false;
          offset += list.length;
        }
        return false;
      } catch {
        console.error("HighLevel media list failed: step=verify");
        return false;
      }
    },

    // One attempt, status `trashed`, never the permanent route.
    async trash(tenantId: string, fileId: string): Promise<MediaTrashOutcome> {
      let locationId: string | null;
      let token: string;
      try {
        locationId = await deps.readLocationId(tenantId);
        if (!locationId) return "failed";
        token = await deps.getLocationToken(tenantId);
      } catch {
        console.error("HighLevel media trash failed: step=token");
        return "failed";
      }
      try {
        const response = await deps.requestTrash(token, locationId, fileId);
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          console.error(`HighLevel media trash failed: status=${response.status}`);
          if (response.status === 401 || response.status === 403) return "permission";
          return response.status === 408 || response.status >= 500 ? "unconfirmed" : "failed";
        }
        const json = JSON.parse(await response.text()) as unknown;
        const done = Array.isArray(json) && json.some((row) => typeof row === "object" && row !== null && (row as Record<string, unknown>).id === fileId && (row as Record<string, unknown>).deleted === true);
        return done ? "trashed" : "unconfirmed";
      } catch {
        console.error("HighLevel media trash failed: step=send");
        return "unconfirmed";
      }
    },

    // One attempt, never repeated here: the caller re-reads the list after no answer.
    async upload(tenantId: string, file: MediaUpload): Promise<MediaUploadOutcome> {
      let token: string;
      try {
        if (!(await deps.readLocationId(tenantId))) return { kind: "connection" };
        token = await deps.getLocationToken(tenantId);
      } catch (error) {
        console.error("HighLevel media upload failed: step=token");
        return { kind: tokenReason(error) };
      }
      try {
        const response = await deps.requestUpload(token, file);
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          console.error(`HighLevel media upload failed: status=${response.status}`);
          return { kind: uploadKindOf(response.status) };
        }
        const json = JSON.parse(await response.text()) as Record<string, unknown>;
        if (!filled(json?.fileId) || !filled(json?.url)) return { kind: "no_answer" };
        return { kind: "uploaded", fileId: json.fileId, url: json.url };
      } catch {
        console.error("HighLevel media upload failed: step=send");
        return { kind: "no_answer" };
      }
    },
  };
}

function isAllowedUrl(raw: string, hosts: readonly string[]): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.username === "" && url.password === "" && (url.port === "" || url.port === "443") && hosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Reads a library file to compare its bytes: https, an allowed host, no redirect, a timeout and a size cap.
export async function fetchMediaBytes(
  raw: string,
  hosts: readonly string[],
  options: { fetch?: typeof fetch; timeoutMs?: number; maxBytes: number },
): Promise<Uint8Array | null> {
  if (!isAllowedUrl(raw, hosts)) return null;
  try {
    const response = await (options.fetch ?? fetch)(raw, { redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS) });
    if (response.status !== 200 || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}
