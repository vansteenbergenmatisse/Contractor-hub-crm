import { isRole, type Role } from "../types";

// Server-side guards. The session lookup is injected (Better Auth in production). Everything fails
// closed: a lookup error, an odd role or a role/tenant mismatch counts as "not signed in".
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  disabledAt?: Date | null;
};

export class TenancyError extends Error {
  constructor(readonly status: 401 | 403 | 404) {
    super(`Tenancy error: ${status}`);
    this.name = "TenancyError";
  }
}

export type GuardDeps = {
  getSession: (request: Request) => Promise<SessionUser | null>;
  // True when the tenant's app was uninstalled in HighLevel: its users are then signed out at once.
  // A throw counts as "not signed in". Left out, the status is not checked.
  isTenantUninstalled?: (tenantId: string) => Promise<boolean>;
};

export function createGuards(deps: GuardDeps) {
  async function currentUser(request: Request): Promise<SessionUser | null> {
    let user: SessionUser | null;
    try {
      user = await deps.getSession(request);
    } catch {
      return null;
    }
    if (!user || !isRole(user.role) || user.disabledAt) return null;
    const hasTenant = typeof user.tenantId === "string" && user.tenantId.length > 0;
    if (user.role === "admin" ? user.tenantId !== null : !hasTenant) return null;
    if (deps.isTenantUninstalled && user.tenantId !== null) {
      try {
        if (await deps.isTenantUninstalled(user.tenantId)) return null;
      } catch {
        return null;
      }
    }
    return user;
  }

  async function isAdmin(request: Request): Promise<boolean> {
    return (await currentUser(request))?.role === "admin";
  }

  async function adminId(request: Request): Promise<string | null> {
    const user = await currentUser(request);
    return user?.role === "admin" ? user.id : null;
  }

  // The tenant of a request is the session's tenant. `requested` (for example from a URL) can only
  // confirm it: any other value answers 404, so another tenant's existence is not revealed.
  async function tenantOf(request: Request, requested?: string): Promise<{ user: SessionUser; tenantId: string }> {
    const user = await currentUser(request);
    if (!user) throw new TenancyError(401);
    if (user.role === "admin" || user.tenantId === null) throw new TenancyError(403);
    if (requested !== undefined && requested !== user.tenantId) throw new TenancyError(404);
    return { user, tenantId: user.tenantId };
  }

  return { currentUser, isAdmin, adminId, tenantOf };
}
