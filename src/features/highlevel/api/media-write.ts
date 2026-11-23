import { TokenServiceError } from "./token-service";

// The media library calls of Settings' Change image. Contract: OpenAPI `apps/medias.json` and
// `apps/v3/medias-v3.json` at commit 0af86a4; no real response has been seen. There is deliberately no
// delete, rename or update here: the old file always stays. Logs hold the step and status only.
const MAX_LIST_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

export type MediaFile = { name: string; url: string };
export type MediaFind = { ok: true; files: MediaFile[] } | { ok: false; reason: "permission" | "connection" | "retry" };
export type MediaUpload = { bytes: Uint8Array; name: string; fileName: string; contentType: string };
// `no_answer`: a timeout, 5xx or unreadable 2xx, so the file may exist. It is never uploaded again blindly.
export type MediaUploadOutcome =
  | { kind: "uploaded"; fileId: string; url: string }
  | { kind: "rejected" | "permission" | "connection" | "retry" | "no_answer" };

export type MediaAdapterDeps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  getLocationToken: (tenantId: string) => Promise<string>;
  requestFiles: (accessToken: string, locationId: string, name: string) => Promise<Response>;
  requestUpload: (accessToken: string, file: MediaUpload) => Promise<Response>;
};

const filled = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function parseFiles(json: unknown, locationId: string, name: string): MediaFile[] {
  const list = typeof json === "object" && json !== null ? (json as Record<string, unknown>).files : null;
  if (!Array.isArray(list)) throw new Error("HighLevel media list returned an unexpected response.");
  const out: MediaFile[] = [];
  for (const raw of list as unknown[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (item.name !== name || !filled(item.url)) continue;
    if (item.altId !== undefined && item.altId !== locationId) continue;
    if (item.altType !== undefined && item.altType !== "location") continue;
    out.push({ name, url: item.url });
  }
  return out;
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
  return {
    async find(tenantId: string, name: string): Promise<MediaFind> {
      try {
        const locationId = await deps.readLocationId(tenantId);
        if (!locationId) return { ok: false, reason: "connection" };
        const response = await deps.requestFiles(await deps.getLocationToken(tenantId), locationId, name);
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          console.error(`HighLevel media list failed: status=${response.status}`);
          return { ok: false, reason: response.status === 401 || response.status === 403 ? "permission" : "retry" };
        }
        const body = await response.text();
        if (body.length > MAX_LIST_BYTES) throw new Error("HighLevel media list is too large.");
        return { ok: true, files: parseFiles(JSON.parse(body), locationId, name) };
      } catch (error) {
        console.error("HighLevel media list failed: step=read");
        return { ok: false, reason: tokenReason(error) };
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
