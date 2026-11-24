import { MAX_VALUE_LENGTH, classifyKey, type SaveResult, type ValueChange } from "@/features/settings";
import { isMigrationPendingError } from "@/shared/lib/migration-pending";
import { ADMIN_KEY } from "./view";

// POST /api/admin/clients/[tenantId]/values. Admin only, same Origin, JSON only, refused during View
// as client, rate limited. The tenant comes from the URL and must be connected. A save also needs the
// Settings write-back flag for that tenant (off, or the tenant in SETTINGS_WRITE_BACK_EXCLUDE: nothing
// is written). Lock and unlock change only this app's lock table, never HighLevel.
export type AdminValuesRouteDeps = {
  appOrigin: string;
  adminId: (request: Request) => Promise<string | null>;
  // True while this admin has a View as client cookie.
  isViewing: (request: Request) => Promise<boolean>;
  limiter: (key: string) => Promise<boolean>;
  isConnected: (tenantId: string) => Promise<boolean>;
  isEnabled: (tenantId: string) => boolean;
  save: (input: { tenantId: string; actorId: string; changes: ValueChange[]; scope: "admin" }) => Promise<{ results: SaveResult[] }>;
  lock: (tenantId: string, key: string, adminId: string) => Promise<void>;
  unlock: (tenantId: string, key: string) => Promise<void>;
};

const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY_CHARS = 16 * 1024;
const HEADERS = { "cache-control": "no-store", "content-type": "application/json" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export const adminValuesFailure = () => reply(500, { error: "failed" });

// Key names only, never a value.
function audit(event: string, fields: Record<string, string>) {
  console.info(JSON.stringify({ audit: event, ...fields }));
}

// Stops reading at the limit, so an oversized body is never fully buffered. Null: too large.
async function readCapped(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) {
    await request.body.cancel().catch(() => {});
    return null;
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY_CHARS) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

type Body ={ action: "save"; change: ValueChange } | { action: "lock" | "unlock"; key: string };

const hasOnly = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function parseBody(raw: unknown): Body | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.key !== "string" || !ADMIN_KEY.test(body.key)) return null;
  if (body.action === "lock" || body.action === "unlock") {
    if (!hasOnly(body, ["action", "key"])) return null;
    // A secret key is always hidden from the owner (implicitly locked): no row for it. Unlock still
    // works, so an old row can be removed.
    if (body.action === "lock" && classifyKey(body.key) === "secret") return null;
    return { action: body.action, key: body.key };
  }
  if (body.action !== "save" || !hasOnly(body, ["action", "key", "expected", "value"])) return null;
  const { key, expected, value } = body;
  if (typeof expected !== "string" || typeof value !== "string" || expected.length > MAX_VALUE_LENGTH || value.length > MAX_VALUE_LENGTH) return null;
  // An empty box is an explicit clear; the save still clears only keys that may be empty.
  return { action: "save", change: value.trim() === "" ? { key, expected, value: "", clear: true } : { key, expected, value } };
}

export async function handleAdminValues(request: Request, tenantId: string, deps: AdminValuesRouteDeps): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return reply(403, { error: "forbidden" });
  const admin = await deps.adminId(request);
  if (admin === null) return reply(403, { error: "forbidden" });
  if (await deps.isViewing(request).catch(() => true)) return reply(403, { error: "viewing" });
  let allowed = false;
  try {
    allowed = await deps.limiter(`admin-values:${admin}`);
  } catch {
    allowed = false;
  }
  if (!allowed) return reply(429, { error: "rate_limited" });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return reply(415, { error: "unsupported" });
  if (!TENANT_ID.test(tenantId)) return reply(400, { error: "invalid_request" });
  const text = await readCapped(request);
  if (text === null) return reply(400, { error: "invalid_request" });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return reply(400, { error: "invalid_request" });
  }
  const body = parseBody(raw);
  if (!body) return reply(400, { error: "invalid_request" });
  if (!(await deps.isConnected(tenantId))) return reply(404, { error: "not_found" });

  if (body.action === "save") {
    if (!deps.isEnabled(tenantId)) return reply(409, { error: "write_off" });
    const { change } = body;
    audit("admin_value_save", { by: admin, tenantId, key: change.key });
    const answer = await deps.save({ tenantId, actorId: admin, changes: [change], scope: "admin" });
    audit("admin_value_saved", { by: admin, tenantId, key: change.key, status: answer.results[0]?.status ?? "none" });
    return reply(200, answer);
  }
  try {
    if (body.action === "lock") await deps.lock(tenantId, body.key, admin);
    else await deps.unlock(tenantId, body.key);
  } catch (error) {
    // The lock table is not in this database yet: nothing changed, and trying again cannot help.
    // Any other error still goes to the caller's 500.
    if (!isMigrationPendingError(error)) throw error;
    console.error(`Admin value ${body.action} failed: reason=migration_pending migration=${error.migration}`);
    return reply(409, { error: "pending_update", migration: error.migration });
  }
  audit(`admin_value_${body.action}`, { by: admin, tenantId, key: body.key });
  return reply(200, { key: body.key, locked: body.action === "lock" });
}
