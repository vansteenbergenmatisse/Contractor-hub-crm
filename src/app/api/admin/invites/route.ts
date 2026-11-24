import { getGuards, getInviteLimiter, getInviteService, handleCreateInvite } from "@/features/auth";
import { createSignInMailBudget } from "@/features/onboarding";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

// Admin only: create an invite for one tenant. The link comes back in the response. When the email
// already has a never-used account in this client, a set-password link is issued instead, and its mail
// counts against the client's daily cap like "Send sign-in email".
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleCreateInvite(request, {
      guards: getGuards(),
      service: getInviteService({ mailBudget: createSignInMailBudget() }),
      appOrigin: new URL(env.APP_URL).origin,
      limiter: getInviteLimiter(),
    });
  } catch {
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
