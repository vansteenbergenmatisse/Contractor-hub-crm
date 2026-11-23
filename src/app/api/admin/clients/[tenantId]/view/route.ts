import { clientViewDeps, getGuards, getInviteLimiter, handleStartClientView } from "@/features/auth";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

// Admin only: start a read-only view of one client.
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }): Promise<Response> {
  try {
    const env = parseEnv("auth");
    const { tenantId } = await context.params;
    return await handleStartClientView(request, tenantId, {
      ...clientViewDeps(env.BETTER_AUTH_SECRET),
      guards: getGuards(),
      limiter: getInviteLimiter(),
      appOrigin: new URL(env.APP_URL).origin,
    });
  } catch {
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
