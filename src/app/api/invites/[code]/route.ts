import { getInviteLimiter, getInviteService, handleAcceptInvite, handlePreviewInvite } from "@/features/auth";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };
const notConfigured = () => new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const { code } = await context.params;
    return await handlePreviewInvite(code, { service: getInviteService(), limiter: getInviteLimiter(), request });
  } catch {
    return notConfigured();
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const { code } = await context.params;
    const env = parseEnv("auth");
    return await handleAcceptInvite(request, code, {
      service: getInviteService(),
      appOrigin: new URL(env.APP_URL).origin,
      limiter: getInviteLimiter(),
    });
  } catch {
    return notConfigured();
  }
}
