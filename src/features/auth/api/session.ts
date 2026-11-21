import type { Auth } from "./auth";
import type { SessionUser } from "./guards";

// Maps a Better Auth session to the guards' SessionUser. role, tenantId and disabledAt are our own
// user fields (see api/auth.ts); a missing tenant is null.
export async function readSession(auth: Auth, headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const user = session.user as typeof session.user & {
    role: SessionUser["role"];
    tenantId?: string | null;
    disabledAt?: Date | null;
  };
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId ?? null,
    disabledAt: user.disabledAt ?? null,
  };
}
