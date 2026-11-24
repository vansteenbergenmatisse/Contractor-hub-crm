import { getGuards, getInviteLimiter, getSignInLinkService, handleListSignInAccounts, handleSendSignInEmail } from "@/features/auth";
import { createMailCap } from "@/features/onboarding";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

const notConfigured = () => new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });

// Admin only: the users of one client and whether each may get a sign-in email.
export async function GET(request: Request): Promise<Response> {
  try {
    return await handleListSignInAccounts(request, { guards: getGuards(), service: getSignInLinkService(), limiter: getInviteLimiter() });
  } catch {
    return notConfigured();
  }
}

// Admin only: a fresh set-password link for one never-used account, mailed when delivery allows it
// (the client's daily mail cap applies) and always returned for the admin to copy.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    const mailCap = createMailCap({ now: () => new Date(), gateOpen: () => true });
    return await handleSendSignInEmail(request, {
      guards: getGuards(),
      service: getSignInLinkService({ mailBudget: (tenantId, send) => mailCap.send(tenantId, send) }),
      appOrigin: new URL(env.APP_URL).origin,
      limiter: getInviteLimiter(),
    });
  } catch {
    return notConfigured();
  }
}
