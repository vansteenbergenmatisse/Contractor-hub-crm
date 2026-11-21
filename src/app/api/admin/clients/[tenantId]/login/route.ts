import {
  getAuth,
  getGuards,
  getInviteLimiter,
  handleSetTenantLogin,
  listTenantUserIds,
  setUserDisabled,
} from "@/features/auth";
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
      limiter: getInviteLimiter(),
      appOrigin: new URL(env.APP_URL).origin,
    });
  } catch {
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
