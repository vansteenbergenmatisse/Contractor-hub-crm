import { allowed, audit, jsonBody, reply, sameOrigin, type RateLimiter } from "./invite-routes";
import type { HighLevelUser } from "@/features/highlevel";
import type { createGuards } from "./guards";
import type { GhlUserInput, ProvisionResult } from "./provision";

type RemovedCheckSync = {
  provision(input: GhlUserInput): Promise<ProvisionResult>;
  deactivate(tenantId: string, ghlUserId: string): Promise<boolean>;
  activeLinks(tenantId: string): Promise<Array<{ ghlUserId: string; userId: string }>>;
};

// After "Turn on login": block whoever left HighLevel while login was off. A hand block leaves no
// mark on the link, so only a fresh list can tell. Runs the onboarding sync, injected because
// onboarding imports auth, with its guards against an empty or suspicious list. Its provision step
// does nothing, so this never restores, creates, links, updates or mails anyone.
// True when the list was read and acted on; a false answer means nobody was proven still listed.
export function createRemovedUserCheck(deps: {
  readUsers: (tenantId: string) => Promise<HighLevelUser[]>;
  syncUsers: (
    sync: RemovedCheckSync,
    tenantId: string,
    users: readonly HighLevelUser[],
    options: { mayDeactivate: boolean; mayRestore?: boolean },
  ) => Promise<{ failed: number; suspicious: number }>;
  deactivate: RemovedCheckSync["deactivate"];
  activeLinks: RemovedCheckSync["activeLinks"];
}): (tenantId: string) => Promise<boolean> {
  return async (tenantId) => {
    const users = await deps.readUsers(tenantId);
    if (users.length === 0) return false;
    // A list that names none of the active links says nothing about who left, and a block made here
    // is not undone by a later turn-on. A listed id counts with or without an email.
    const links = await deps.activeLinks(tenantId);
    const present = new Set(users.filter((user) => !user.deleted).map((user) => user.id));
    if (links.length > 0 && !links.some((link) => present.has(link.ghlUserId))) return false;
    const counts = await deps.syncUsers(
      { provision: async () => ({ outcome: "exists", userId: null }), deactivate: deps.deactivate, activeLinks: deps.activeLinks },
      tenantId,
      users,
      { mayDeactivate: true, mayRestore: false },
    );
    return counts.failed === 0 && counts.suspicious === 0;
  };
}

// "Turn off login" / "Turn on login" for one client (build prompt section 4.8). Admin only, same
// Origin, JSON only. Every non-admin user of the tenant is switched; turning off also ends their
// sessions (setUserDisabled). Responses are fixed shapes.
export async function handleSetTenantLogin(
  request: Request,
  tenantId: string,
  deps: {
    guards: ReturnType<typeof createGuards>;
    // Ids of the tenant's non-admin users, or null when the tenant does not exist.
    // `excludeRemoved` leaves out users HighLevel no longer lists, so turning on never revives them.
    listUserIds: (tenantId: string, options?: { excludeRemoved?: boolean }) => Promise<string[] | null>;
    setUserDisabled: (userId: string, disabled: boolean) => Promise<void>;
    // The client-level switch that stops new people too (embed, provisioning, invites).
    setTenantLoginDisabled?: (tenantId: string, disabled: boolean) => Promise<void>;
    limiter: RateLimiter;
    appOrigin: string;
    // Runs after a turn-on. False or a throw never undoes it: the answer carries removedCheck "failed".
    afterTurnOn?: (tenantId: string) => Promise<boolean>;
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
  // Written before any change, so a crash or timeout midway still leaves a record of the attempt.
  audit("tenant_login_attempt", { by: admin, tenantId, disabled: String(disabled) });
  const userIds = await deps.listUserIds(tenantId, { excludeRemoved: !disabled });
  if (userIds === null) return reply(404, { error: "not_found" });

  // Off: set first, so nobody can arrive while the users are being switched.
  if (disabled) {
    try {
      await deps.setTenantLoginDisabled?.(tenantId, true);
    } catch (error) {
      console.error("Tenant login switch failed:", error instanceof Error ? error.name : "unknown error");
      return reply(500, { error: "partial", affected: 0 });
    }
  }

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
  audit("tenant_login_changed", {
    by: admin,
    tenantId,
    disabled: String(disabled),
    affected: String(affected),
    failed: String(failed),
  });
  let checkFailed = false;
  if (!disabled && deps.afterTurnOn) {
    try {
      checkFailed = !(await deps.afterTurnOn(tenantId));
    } catch (error) {
      checkFailed = true;
      console.error("Removed-user check failed:", error instanceof Error ? error.name : "unknown error");
    }
    audit("tenant_login_removed_check", { by: admin, tenantId, outcome: checkFailed ? "failed" : "ok" });
  }
  const check = checkFailed ? { removedCheck: "failed" } : {};
  // On: cleared last, so nobody signs in before the removed-user check has run. A partial turn-on
  // keeps the client off until a retry finishes it.
  if (!disabled && failed === 0) {
    try {
      await deps.setTenantLoginDisabled?.(tenantId, false);
    } catch (error) {
      console.error("Tenant login switch failed:", error instanceof Error ? error.name : "unknown error");
      return reply(500, { error: "partial", affected, ...check });
    }
  }
  return failed > 0 ? reply(500, { error: "partial", affected, ...check }) : reply(200, { affected, ...check });
}
