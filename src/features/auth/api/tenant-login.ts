import { allowed, audit, jsonBody, reply, sameOrigin, type RateLimiter } from "./invite-routes";
import type { createGuards } from "./guards";

// "Turn off login" / "Turn on login" for one client (build prompt section 4.8). Admin only, same
// Origin, JSON only. Every non-admin user of the tenant is switched; turning off also ends their
// sessions (setUserDisabled). Responses are fixed shapes.
export async function handleSetTenantLogin(
  request: Request,
  tenantId: string,
  deps: {
    guards: ReturnType<typeof createGuards>;
    // Ids of the tenant's non-admin users, or null when the tenant does not exist.
    listUserIds: (tenantId: string) => Promise<string[] | null>;
    setUserDisabled: (userId: string, disabled: boolean) => Promise<void>;
    limiter: RateLimiter;
    appOrigin: string;
  },
): Promise<Response> {
  const admin = await deps.guards.adminId(request);
  if (admin === null || !sameOrigin(request, deps.appOrigin)) return reply(403, { error: "forbidden" });
  if (!(await allowed(deps.limiter, `tenant-login:${admin}`))) return reply(429, { error: "rate_limited" });
  const body = await jsonBody(request);
  if (body === "unsupported") return reply(415, { error: "unsupported" });
  if (typeof body?.disabled !== "boolean" || tenantId.length === 0 || tenantId.length > 64) {
    return reply(400, { error: "invalid_request" });
  }
  const disabled = body.disabled;
  const userIds = await deps.listUserIds(tenantId);
  if (userIds === null) return reply(404, { error: "not_found" });

  let affected = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      await deps.setUserDisabled(userId, disabled);
      affected += 1;
    } catch (error) {
      failed += 1;
      console.error("Tenant login change failed:", error instanceof Error ? error.name : "unknown error");
    }
  }
  audit("tenant_login_changed", { by: admin, tenantId, disabled: String(disabled), affected: String(affected) });
  return failed > 0 ? reply(500, { error: "partial", affected }) : reply(200, { affected });
}
