import { HighLevelHttpError } from "./client";
import { TokenServiceError } from "./token-service";

// The write side of custom values. Contract: OpenAPI `apps/locations.json` at commit 0af86a4; no real
// response has been seen. Logs hold the step and status only, never a key's value, a token or a body.
const MAX_LIST_BYTES = 5 * 1024 * 1024;
const FIELD_KEY = /^\{\{\s*custom_values\.([A-Za-z0-9_]+)\s*\}\}$/;

export type CustomValueDetail = { id: string; key: string; name: string; value: string };
export type CustomValueWriteOutcome = "saved" | "rejected" | "permission" | "retry";
export type CustomValueRead = { ok: true; values: CustomValueDetail[] } | { ok: false; reason: "permission" | "retry" };

export type CustomValueAdapterDeps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  // Never a forced refresh: a 401 here can mean a missing write scope, and must not rotate a healthy token.
  getLocationToken: (tenantId: string) => Promise<string>;
  requestList: (accessToken: string, locationId: string) => Promise<Response>;
  requestUpdate: (accessToken: string, locationId: string, id: string, body: { name: string; value: string }) => Promise<Response>;
};

const filled = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

// A row needs an id, a name (the update requires it) and a readable key. A key listed twice is left
// out completely: which row it means cannot be known, so neither may be written.
export function parseCustomValueDetails(json: unknown, locationId: string): CustomValueDetail[] {
  const list = typeof json === "object" && json !== null ? (json as Record<string, unknown>).customValues : null;
  if (!Array.isArray(list)) throw new Error("HighLevel custom values returned an unexpected response.");
  const rows: CustomValueDetail[] = [];
  const seen = new Map<string, number>();
  for (const raw of list as unknown[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const key = typeof item.fieldKey === "string" ? FIELD_KEY.exec(item.fieldKey.trim())?.[1] : undefined;
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (!filled(item.id) || !filled(item.name)) continue;
    if (item.locationId !== undefined && item.locationId !== locationId) continue;
    if (item.value !== null && item.value !== undefined && typeof item.value !== "string") continue;
    rows.push({ id: item.id, key, name: item.name, value: item.value ?? "" });
  }
  return rows.filter((row) => seen.get(row.key) === 1);
}

function outcomeOfStatus(status: number): CustomValueWriteOutcome {
  if (status >= 200 && status < 300) return "saved";
  if (status === 400 || status === 422) return "rejected";
  if (status === 401 || status === 403) return "permission";
  return "retry";
}

function outcomeOfError(step: string, error: unknown): "permission" | "retry" {
  if (error instanceof TokenServiceError) {
    console.error(`HighLevel custom value ${step} failed: step=token code=${error.code}`);
    return error.code === "unavailable" ? "retry" : "permission";
  }
  const status = error instanceof HighLevelHttpError ? error.status : null;
  console.error(`HighLevel custom value ${step} failed: status=${status ?? "none"}`);
  return "retry";
}

async function readListJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body.length > MAX_LIST_BYTES) throw new Error("HighLevel custom values answer is too large.");
  return JSON.parse(body);
}

// `update` makes one attempt and is never repeated, also not after a 401.
export function createCustomValueAdapter(deps: CustomValueAdapterDeps) {
  return {
    async read(tenantId: string): Promise<CustomValueRead> {
      try {
        const locationId = await deps.readLocationId(tenantId);
        if (!locationId) return { ok: false, reason: "permission" };
        const response = await deps.requestList(await deps.getLocationToken(tenantId), locationId);
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          console.error(`HighLevel custom value read failed: status=${response.status}`);
          return { ok: false, reason: response.status === 401 || response.status === 403 ? "permission" : "retry" };
        }
        return { ok: true, values: parseCustomValueDetails(await readListJson(response), locationId) };
      } catch (error) {
        return { ok: false, reason: outcomeOfError("read", error) };
      }
    },

    async update(tenantId: string, target: CustomValueDetail, value: string): Promise<CustomValueWriteOutcome> {
      try {
        const locationId = await deps.readLocationId(tenantId);
        if (!locationId) return "permission";
        const response = await deps.requestUpdate(await deps.getLocationToken(tenantId), locationId, target.id, { name: target.name, value });
        await response.body?.cancel().catch(() => {});
        const outcome = outcomeOfStatus(response.status);
        if (outcome !== "saved") console.error(`HighLevel custom value update failed: status=${response.status}`);
        return outcome;
      } catch (error) {
        return outcomeOfError("update", error);
      }
    },
  };
}
