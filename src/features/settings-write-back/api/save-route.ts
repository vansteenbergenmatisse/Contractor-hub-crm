import { MAX_VALUE_LENGTH, type SaveResult, type ValueChange } from "@/features/settings";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CHANGES = 20;
const MAX_KEY_LENGTH = 100;
const HOUR_MS = 60 * 60 * 1000;
// Proposals, not measured numbers.
export const SAVES_PER_HOUR_PER_USER = 40;
export const SAVES_PER_HOUR_PER_TENANT = 30;

type SaveUser = { id: string; role: "owner" | "office" | "admin"; tenantId: string | null };
export type SaveRouteDeps = {
  appOrigin: string;
  currentUser: (request: Request) => Promise<SaveUser | null>;
  isEnabled: (tenantId: string) => boolean;
  hit: (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;
  save: (input: { tenantId: string; actorId: string; changes: ValueChange[] }) => Promise<{ results: SaveResult[] }>;
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "cache-control": "no-store", "content-type": "application/json" } });

export const saveFailure = () => reply(500, { error: "failed" });

// Stops reading at the limit, so an oversized body is never fully buffered.
async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

const hasOnly = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

// Strict: any other field, including a tenant id, refuses the whole request.
function parseChanges(raw: string | null): ValueChange[] | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null || !hasOnly(json, ["changes"])) return null;
  const list = (json as { changes: unknown }).changes;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_CHANGES) return null;
  const seen = new Set<string>();
  const changes: ValueChange[] = [];
  for (const item of list as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    // A clear is explicit: exactly `clear: true` with an empty value.
    const marked = Object.hasOwn(item, "clear");
    if (!hasOnly(item, marked ? ["key", "expected", "value", "clear"] : ["key", "expected", "value"])) return null;
    const { key, expected, value, clear } = item as Record<string, unknown>;
    if (marked && (clear !== true || value !== "")) return null;
    if (typeof key !== "string" || typeof expected !== "string" || typeof value !== "string") return null;
    if (!key || key.length > MAX_KEY_LENGTH || expected.length > MAX_VALUE_LENGTH || value.length > MAX_VALUE_LENGTH || seen.has(key)) return null;
    seen.add(key);
    changes.push(marked ? { key, expected, value, clear: true } : { key, expected, value });
  }
  return changes;
}

// User and tenant come from the session only. Owners of a tenant only: an admin, also during a client
// view, is refused. With the flag off nothing further runs and the route answers as if it did not exist.
export async function handleSaveValues(request: Request, deps: SaveRouteDeps): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return reply(403, { error: "forbidden" });
  const user = await deps.currentUser(request);
  if (!user) return reply(401, { error: "unauthorized" });
  if (user.role !== "owner" || !user.tenantId) return reply(403, { error: "forbidden" });
  const tenantId = user.tenantId;
  if (!deps.isEnabled(tenantId)) return reply(404, { error: "not_found" });
  let allowed = false;
  try {
    const now = new Date();
    allowed = await deps.hit(`settings-save-user:${user.id}`, SAVES_PER_HOUR_PER_USER, HOUR_MS, now)
      && await deps.hit(`settings-save-tenant:${tenantId}`, SAVES_PER_HOUR_PER_TENANT, HOUR_MS, now);
  } catch {
    console.error("Settings save failed: step=limiter");
  }
  if (!allowed) return reply(429, { error: "too_many" });
  const changes = parseChanges(await readBody(request));
  if (!changes) return reply(400, { error: "invalid" });
  return reply(200, await deps.save({ tenantId, actorId: user.id, changes }));
}
