import { createHmac, timingSafeEqual } from "node:crypto";
import type { createGuards, SessionUser } from "./guards";
import { allowed, audit, reply, sameOrigin, type RateLimiter } from "./invite-routes";

// Read-only "View as client" for Forge Forward admins. The admin's session never changes: it stays
// tenantless, so every write route (which goes through the guards) keeps refusing it. A signed,
// short-lived cookie only tells the server pages which client's data to read. It is re-checked on
// every request. Logs and audit lines carry ids only, never customer data.
const TTL_SECONDS = 3600;
const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Guards = ReturnType<typeof createGuards>;

export type ClientViewDeps = {
  secret: string;
  now: () => Date;
  // True when the client does not exist or was uninstalled. A throw counts as unavailable.
  isTenantUnavailable: (tenantId: string) => Promise<boolean>;
  // Kill switch (server flag CLIENT_VIEW_DISABLED=true).
  disabled: boolean;
};

export type ClientViewRouteDeps = ClientViewDeps & { guards: Guards; limiter: RateLimiter; appOrigin: string };

// `__Host-` binds the cookie to this exact host over https. Plain http (local dev) cannot use it.
export const clientViewCookieName = (appOrigin: string): string =>
  appOrigin.startsWith("https:") ? "__Host-client-view" : "client-view";

function signature(payload: string, secret: string): string {
  const subkey = createHmac("sha256", secret).update("client-view-v1").digest();
  return createHmac("sha256", subkey).update(payload).digest("base64url");
}

export function signClientView(view: { adminId: string; tenantId: string }, secret: string, at: Date): string {
  const payload = Buffer.from(
    JSON.stringify({ a: view.adminId, t: view.tenantId, e: at.getTime() + TTL_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

function readToken(value: string, secret: string, now: Date): { adminId: string; tenantId: string } | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, given] = parts;
  const expected = Buffer.from(signature(payload, secret));
  const received = Buffer.from(given);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { a, t, e } = parsed as Record<string, unknown>;
    if (typeof a !== "string" || typeof t !== "string" || typeof e !== "number") return null;
    if (!TENANT_ID.test(t) || e <= now.getTime()) return null;
    return { adminId: a, tenantId: t };
  } catch {
    return null;
  }
}

async function unavailable(deps: Pick<ClientViewDeps, "isTenantUnavailable">, tenantId: string): Promise<boolean> {
  try {
    return await deps.isTenantUnavailable(tenantId);
  } catch {
    return true;
  }
}

// The user the server pages work with. Anything not exactly right leaves the user unchanged, which
// for an admin means no tenant and so no client data.
export async function applyClientView<U extends SessionUser>(
  user: U | null,
  value: string | undefined,
  deps: ClientViewDeps,
): Promise<(U & { viewing?: boolean }) | null> {
  if (!user || user.role !== "admin" || user.tenantId !== null || !value || deps.disabled) return user;
  const view = readToken(value, deps.secret, deps.now());
  if (!view || view.adminId !== user.id || (await unavailable(deps, view.tenantId))) return user;
  audit("client_view_read", { by: user.id, tenantId: view.tenantId });
  return { ...user, tenantId: view.tenantId, viewing: true };
}

function withCookie(response: Response, cookie: string): Response {
  response.headers.append("set-cookie", cookie);
  return response;
}

function cookieAttributes(appOrigin: string, maxAge: number): string {
  const secure = appOrigin.startsWith("https:") ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function handleStartClientView(request: Request, tenantId: string, deps: ClientViewRouteDeps): Promise<Response> {
  const admin = await deps.guards.adminId(request);
  if (admin === null || !sameOrigin(request, deps.appOrigin)) return reply(403, { error: "forbidden" });
  if (deps.disabled) return reply(404, { error: "not_found" });
  if (!(await allowed(deps.limiter, `client-view:${admin}`))) return reply(429, { error: "rate_limited" });
  if (!TENANT_ID.test(tenantId)) return reply(400, { error: "invalid_request" });
  if (await unavailable(deps, tenantId)) return reply(404, { error: "not_found" });
  audit("client_view_started", { by: admin, tenantId });
  const value = signClientView({ adminId: admin, tenantId }, deps.secret, deps.now());
  const name = clientViewCookieName(deps.appOrigin);
  return withCookie(reply(200, { ok: true }), `${name}=${value}; ${cookieAttributes(deps.appOrigin, TTL_SECONDS)}`);
}

// Only clears the caller's own cookie, so it works even if the admin's session has ended.
export async function handleExitClientView(request: Request, deps: Pick<ClientViewRouteDeps, "guards" | "appOrigin">): Promise<Response> {
  if (!sameOrigin(request, deps.appOrigin)) return reply(403, { error: "forbidden" });
  const admin = await deps.guards.adminId(request);
  if (admin !== null) audit("client_view_ended", { by: admin });
  const name = clientViewCookieName(deps.appOrigin);
  return withCookie(reply(200, { ok: true }), `${name}=; ${cookieAttributes(deps.appOrigin, 0)}`);
}
