import { allowed, audit, jsonBody, reply, sameOrigin, type RateLimiter } from "./invite-routes";
import { InviteError } from "./invites";
import type { createGuards } from "./guards";
import type { SignInLinkService } from "./sign-in-link";

// HTTP layer of the admin's per-person "Send sign-in email" on /admin/clients. Admin only. The POST is
// same-origin JSON and rate limited per admin; the client's daily mail budget is applied inside the
// service. Fixed response shapes; the log carries ids and outcome codes only (no email, no link).
type Guards = ReturnType<typeof createGuards>;

const STATUS: Partial<Record<InviteError["code"], number>> = {
  tenant_unavailable: 404,
  not_found: 404,
  not_eligible: 422,
  already_active: 409,
  account_disabled: 409,
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function failure(error: unknown): Response {
  if (error instanceof InviteError) return reply(STATUS[error.code] ?? 500, { error: STATUS[error.code] ? error.code : "failed" });
  console.error("Sign-in link route failed:", error instanceof Error ? error.name : "unknown error");
  return reply(500, { error: "failed" });
}

export async function handleListSignInAccounts(
  request: Request,
  deps: { guards: Guards; service: Pick<SignInLinkService, "listAccounts">; limiter: RateLimiter },
): Promise<Response> {
  const admin = await deps.guards.adminId(request);
  if (admin === null) return reply(403, { error: "forbidden" });
  if (!(await allowed(deps.limiter, `sign-in-users:${admin}`))) return reply(429, { error: "rate_limited" });
  const tenantId = new URL(request.url).searchParams.get("tenantId") ?? "";
  if (!ID.test(tenantId)) return reply(400, { error: "invalid_request" });
  try {
    return reply(200, { users: await deps.service.listAccounts(tenantId) });
  } catch (error) {
    return failure(error);
  }
}

export async function handleSendSignInEmail(
  request: Request,
  deps: { guards: Guards; service: Pick<SignInLinkService, "sendForUser">; appOrigin: string; limiter: RateLimiter },
): Promise<Response> {
  const admin = await deps.guards.adminId(request);
  if (admin === null || !sameOrigin(request, deps.appOrigin)) return reply(403, { error: "forbidden" });
  if (!(await allowed(deps.limiter, `sign-in-email:${admin}`))) return reply(429, { error: "rate_limited" });
  const body = await jsonBody(request);
  if (body === "unsupported") return reply(415, { error: "unsupported" });
  const { tenantId, userId } = body ?? {};
  if (typeof tenantId !== "string" || !ID.test(tenantId) || typeof userId !== "string" || !ID.test(userId)) {
    return reply(400, { error: "invalid_request" });
  }
  try {
    const issued = await deps.service.sendForUser({ tenantId, userId });
    audit("sign_in_link_issued", { by: admin, tenantId, userId, mail: issued.mail, via: "admin" });
    return reply(200, { kind: "set_password", link: issued.link, email: issued.email, mail: issued.mail, expiresAt: issued.expiresAt.toISOString() });
  } catch (error) {
    audit("sign_in_link_failed", { by: admin, tenantId, reason: error instanceof InviteError ? error.code : "error" });
    return failure(error);
  }
}
