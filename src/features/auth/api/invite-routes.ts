import { isIP } from "node:net";
import { isRole } from "../types";
import { InviteError, type InviteRole } from "./invites";
import type { createGuards } from "./guards";
import type { createInviteService } from "./invites";

// HTTP layer of the invite flow. Same-origin JSON only (the session cookie is SameSite=Lax, and
// the Origin check closes the rest). Responses are fixed shapes: no emails of other people, no
// upstream messages.
type Service = ReturnType<typeof createInviteService>;
// Returns true when the call is allowed. A throw counts as "not allowed" (fail closed).
export type RateLimiter = (key: string) => Promise<boolean>;
type Guards = ReturnType<typeof createGuards>;

const HEADERS = { "cache-control": "no-store", "content-type": "application/json" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

const STATUS: Partial<Record<InviteError["code"], number>> = {
  invalid_role: 400,
  tenant_unavailable: 404,
  not_eligible: 422,
  email_taken: 409,
  send_failed: 502,
  invalid_invite: 404,
  weak_password: 400,
  invalid_name: 400,
};

// Client address for rate limiting: Vercel's header first (not forgeable by the client), then the
// first hop of x-forwarded-for. "unknown" shares one bucket, which is the safe direction.
// The forwarded headers are only trusted on Vercel (VERCEL is set there), where the platform writes
// them; anywhere else a client could invent them to get a fresh bucket per request. The value must
// be an IP address, so a key is never attacker-chosen text.
export function clientKeyFromHeaders(headers: Headers): string {
  if (!process.env.VERCEL) return "unknown";
  const forwarded = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0].trim();
  return isIP(first) !== 0 ? first : "unknown";
}

export function clientKey(request: Request): string {
  return clientKeyFromHeaders(request.headers);
}

async function allowed(limiter: RateLimiter, key: string): Promise<boolean> {
  try {
    return await limiter(key);
  } catch {
    return false;
  }
}

// One structured line per event. Never the code, the link, the password or the email.
function audit(event: string, fields: Record<string, string> = {}): void {
  console.info(JSON.stringify({ audit: event, ...fields }));
}

function sameOrigin(request: Request, appOrigin: string): boolean {
  return request.headers.get("origin") === appOrigin;
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | "unsupported" | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return "unsupported";
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function failure(error: unknown): Response {
  if (error instanceof InviteError) return reply(STATUS[error.code] ?? 500, { error: error.code });
  console.error("Invite route failed:", error instanceof Error ? error.name : "unknown error");
  return reply(500, { error: "failed" });
}

export async function handleCreateInvite(
  request: Request,
  deps: { guards: Guards; service: Pick<Service, "createInvite">; appOrigin: string; limiter: RateLimiter },
): Promise<Response> {
  const admin = await deps.guards.adminId(request);
  if (admin === null || !sameOrigin(request, deps.appOrigin)) return reply(403, { error: "forbidden" });
  // Each create can make a HighLevel call (and a token refresh): cap it per admin.
  if (!(await allowed(deps.limiter, `invite-create:${admin}`))) return reply(429, { error: "rate_limited" });
  const body = await jsonBody(request);
  if (body === "unsupported") return reply(415, { error: "unsupported" });
  const { tenantId, email, role } = body ?? {};
  if (
    typeof tenantId !== "string" || tenantId.length === 0 || tenantId.length > 64 ||
    typeof email !== "string" || email.length === 0 ||
    !isRole(role) || role === "admin"
  ) {
    return reply(400, { error: "invalid_request" });
  }
  try {
    const created = await deps.service.createInvite({ tenantId, email, role: role as InviteRole, createdById: admin });
    audit("invite_created", { by: admin, tenantId, inviteId: created.inviteId });
    return reply(200, { link: created.link, email: created.email });
  } catch (error) {
    audit("invite_create_failed", { by: admin, tenantId, reason: error instanceof InviteError ? error.code : "error" });
    return failure(error);
  }
}

export async function handlePreviewInvite(
  code: string,
  deps: { service: Pick<Service, "previewInvite">; limiter: RateLimiter; request: Request },
): Promise<Response> {
  if (!(await allowed(deps.limiter, `invite-preview:${clientKey(deps.request)}`))) return reply(429, { error: "rate_limited" });
  try {
    const preview = await deps.service.previewInvite(code);
    return preview.valid ? reply(200, { email: preview.email }) : reply(404, { error: "invalid_invite" });
  } catch (error) {
    return failure(error);
  }
}

export async function handleAcceptInvite(
  request: Request,
  code: string,
  deps: { service: Pick<Service, "acceptInvite">; appOrigin: string; limiter: RateLimiter },
): Promise<Response> {
  if (!sameOrigin(request, deps.appOrigin)) return reply(403, { error: "forbidden" });
  if (!(await allowed(deps.limiter, `invite-accept:${clientKey(request)}`))) return reply(429, { error: "rate_limited" });
  const body = await jsonBody(request);
  if (body === "unsupported") return reply(415, { error: "unsupported" });
  const { name, password } = body ?? {};
  if (typeof name !== "string" || typeof password !== "string") return reply(400, { error: "invalid_request" });
  try {
    const accepted = await deps.service.acceptInvite({ code, name, password });
    audit("invite_accepted", { userId: accepted.userId });
    return reply(200, { ok: true });
  } catch (error) {
    audit("invite_accept_failed", { reason: error instanceof InviteError ? error.code : "error" });
    return failure(error);
  }
}
