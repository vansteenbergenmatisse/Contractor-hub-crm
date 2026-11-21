import { getGuards, getInviteLimiter, getInviteService, handleCreateInvite } from "@/features/auth";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

// Admin only: create an invite for one tenant. The link comes back in the response (log-only email).
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleCreateInvite(request, {
      guards: getGuards(),
      service: getInviteService(),
      appOrigin: new URL(env.APP_URL).origin,
      limiter: getInviteLimiter(),
    });
  } catch {
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
