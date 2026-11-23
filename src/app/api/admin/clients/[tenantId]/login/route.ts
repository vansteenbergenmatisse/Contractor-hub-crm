import {
  createRemovedUserCheck,
  deactivateGhlUser,
  getAuth,
  getGuards,
  getInviteLimiter,
  getProvisionDeps,
  handleSetTenantLogin,
  listActiveLinks,
  listTenantUserIds,
  setTenantLoginDisabled,
  setUserDisabled,
} from "@/features/auth";
import { getOnboardingApi } from "@/features/highlevel";
import { syncTenantUsers } from "@/features/onboarding";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

// Admin only: turn login off or on for every user of one client.
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }): Promise<Response> {
  try {
    const env = parseEnv("auth");
    const { tenantId } = await context.params;
    return await handleSetTenantLogin(request, tenantId, {
      guards: getGuards(),
      listUserIds: listTenantUserIds,
      setUserDisabled: (userId, disabled) => setUserDisabled(getAuth(), userId, disabled),
      setTenantLoginDisabled: (id, disabled) => setTenantLoginDisabled(id, disabled),
      limiter: getInviteLimiter(),
      appOrigin: new URL(env.APP_URL).origin,
      afterTurnOn: (id) =>
        createRemovedUserCheck({
          readUsers: (tenant) => getOnboardingApi().usersOfTenant(tenant),
          syncUsers: syncTenantUsers,
          deactivate: (tenant, ghlUserId) => deactivateGhlUser(getProvisionDeps(), tenant, ghlUserId),
          activeLinks: listActiveLinks,
        })(id),
    });
  } catch {
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
