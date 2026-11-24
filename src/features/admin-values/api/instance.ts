import { clientViewCookieName, currentUserFromHeaders, getGuards, hitRateLimit } from "@/features/auth";
import { createTenantCustomValueAdapter } from "@/features/highlevel";
import { isWriteBackEnabled, lockValue, lockedKeysOf, saveTenantValues, unlockValue } from "@/features/settings-write-back";
import { parseEnv } from "@/shared/config";
import { isMigrationPendingError } from "@/shared/lib/migration-pending";
import type { AdminValuesView } from "../types";
import { connectedTenant } from "../db/tenant";
import { handleAdminValues } from "./route";
import { buildAdminValuesView } from "./view";

// Per admin. A proposal, not a measured number: one save or lock per click, many values per client.
const LIMIT = 300;
const WINDOW_MS = 3_600_000;
const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Any View as client cookie, valid or not, counts as viewing (same rule as the template copy).
function hasViewCookie(request: Request, appOrigin: string): boolean {
  const name = clientViewCookieName(appOrigin);
  return (request.headers.get("cookie") ?? "").split(";").some((part) => part.trim().startsWith(`${name}=`));
}

// The route file's whole body. Writes go through the Settings write-back path (audit rows, per-tenant
// save lease, read-back) with the admin as the actor, to this tenant's own location token.
export async function adminValuesRoute(request: Request, tenantId: string): Promise<Response> {
  const env = parseEnv("auth");
  const appOrigin = new URL(env.APP_URL).origin;
  return handleAdminValues(request, tenantId, {
    appOrigin,
    adminId: (req) => getGuards().adminId(req),
    isViewing: async (req) => hasViewCookie(req, appOrigin) || (await currentUserFromHeaders(req.headers))?.viewing === true,
    limiter: (key) => hitRateLimit(key, LIMIT, WINDOW_MS, new Date()),
    isConnected: async (id) => (await connectedTenant(id)) !== null,
    isEnabled: (id) => isWriteBackEnabled(id),
    save: saveTenantValues,
    lock: lockValue,
    unlock: unlockValue,
  });
}

// For /admin/clients/[tenantId]/values. Null: not a connected tenant (the page answers 404).
export async function loadAdminValues(tenantId: string): Promise<AdminValuesView | null> {
  if (!TENANT_ID.test(tenantId)) return null;
  const tenant = await connectedTenant(tenantId);
  if (!tenant) return null;
  const [values, locked] = await Promise.all([
    createTenantCustomValueAdapter().read(tenantId).catch(() => ({ ok: false as const, reason: "retry" as const })),
    // Without the locks the page could show a locked key as unlocked: it shows the load error instead.
    lockedKeysOf(tenantId).catch((error: unknown) => {
      if (isMigrationPendingError(error)) {
        console.error(`Admin values did not load: step=locks reason=migration_pending migration=${error.migration}`);
        return { pending: error.migration };
      }
      console.error("Admin values did not load: step=locks");
      return null;
    }),
  ]);
  // The lock table is not in this database: the page names the migration instead of "try again".
  if (locked && "pending" in locked) {
    return { tenantId, clientName: tenant.name, writable: isWriteBackEnabled(tenantId), loadError: "pending_update", pendingMigration: locked.pending, folders: [] };
  }
  const read = locked ? values : { ok: false as const, reason: "retry" as const };
  if (!read.ok) console.error(`Admin values did not load: step=read reason=${read.reason}`);
  else console.info(`Admin values loaded: keys=${read.values.length}`);
  return buildAdminValuesView({ tenantId, clientName: tenant.name, read, locked: locked ?? new Set(), writable: isWriteBackEnabled(tenantId) });
}
