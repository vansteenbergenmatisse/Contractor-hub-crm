import { createHash, randomBytes } from "node:crypto";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { audit } from "./invite-routes";
import { maskEmail } from "./email-sender";
import { maskEmailHint } from "./sign-in-hint";
import { cleanBusinessName } from "./set-password-email";

// Sign a phone or laptop in with the HighLevel login (user decision 2026-11-24, "one login").
// Two kinds of single-use token, both bound to one CRM user and one tenant:
// - "handoff": made by the /embed sign-in inside HighLevel's frame, lives 2 minutes, carries the person
//   from the frame to the full-screen CRM.
// - "pairing": made by a signed-in person ("Open on my phone or laptop"), lives 5 minutes, opened on the
//   other device by QR code or link.
// Before the tap, POST /api/auth/device-sign-in-preview names the masked person and the business a token
// signs in, without spending it, so a link someone else sent cannot silently switch accounts.
// Both are redeemed by POST /api/auth/device-sign-in from the /device-sign-in page, which starts a
// normal first-party session (SameSite=Lax, Secure, HttpOnly, the long keep-me-signed-in lifetime).
//
// Storage: Better Auth's verification table, identifier `device-sign-in:<sha256 of the token>`, so the
// token itself is never stored. Redeem uses Better Auth's atomic single-use consume: a second use and
// an expired token both fail. The token is 32 random bytes and travels only in a URL fragment and a
// POST body, never in a query string, a log line or the session cookie.
export type DeviceTokenKind = "handoff" | "pairing";

export const DEVICE_TOKEN_SECONDS: Record<DeviceTokenKind, number> = { handoff: 120, pairing: 300 };
export const DEVICE_SIGN_IN_PATH = "/device-sign-in";

const IDENTIFIER_PREFIX = "device-sign-in:";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, no padding
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_REQUESTS = 10; // proposal, not a measured number

export const newDeviceToken = () => randomBytes(32).toString("base64url");
export const hashDeviceToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isDeviceToken = (value: unknown): value is string => typeof value === "string" && TOKEN_PATTERN.test(value);

// The link a person opens on the other device. The token is in the fragment: browsers never send it
// to a server, so it is not in access logs or a Referer header.
export const deviceSignInLink = (appOrigin: string, token: string) => `${appOrigin.replace(/\/+$/, "")}${DEVICE_SIGN_IN_PATH}#t=${token}`;

type Grant = { kind: DeviceTokenKind; userId: string; tenantId: string };

type InternalAdapter = {
  createVerificationValue(data: { identifier: string; value: string; expiresAt: Date }): Promise<unknown>;
  consumeVerificationValue(identifier: string): Promise<{ value: string; expiresAt: Date } | null>;
  findVerificationValue(identifier: string): Promise<{ value: string; expiresAt: Date } | null>;
};

// A stored row back to a grant: null when it is missing, expired or not what issueDeviceToken wrote.
function grantFromRow(row: { value: string; expiresAt: Date } | null): Grant | null {
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return null;
  try {
    const grant = JSON.parse(row.value) as Partial<Grant>;
    if ((grant.kind !== "handoff" && grant.kind !== "pairing") || typeof grant.userId !== "string" || typeof grant.tenantId !== "string") return null;
    return { kind: grant.kind, userId: grant.userId, tenantId: grant.tenantId };
  } catch {
    return null;
  }
}

// Stores a new token for this user and tenant and returns it (the caller hands it to the browser once).
export async function issueDeviceToken(adapter: InternalAdapter, grant: Grant, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = newDeviceToken();
  const expiresAt = new Date(now.getTime() + DEVICE_TOKEN_SECONDS[grant.kind] * 1000);
  await adapter.createVerificationValue({ identifier: IDENTIFIER_PREFIX + hashDeviceToken(token), value: JSON.stringify(grant), expiresAt });
  return { token, expiresAt };
}

// Single use: the row is gone after this call whatever the outcome. Expired, unknown and used tokens
// all give null.
export async function consumeDeviceToken(adapter: InternalAdapter, token: string): Promise<Grant | null> {
  return grantFromRow(await adapter.consumeVerificationValue(IDENTIFIER_PREFIX + hashDeviceToken(token)).catch(() => null));
}

// Read only: the row stays, so only the redeem ever spends a token. A database error is thrown, not
// turned into "no token", so the page never calls a link expired because the database was down.
export async function peekDeviceToken(adapter: InternalAdapter, token: string): Promise<Grant | null> {
  return grantFromRow(await adapter.findVerificationValue(IDENTIFIER_PREFIX + hashDeviceToken(token)));
}

// What the /device-sign-in page may show before the tap. No full email, no ids, no token.
export type DeviceSignInPreview = { kind: DeviceTokenKind; person: string; business: string | null; sameAsCurrent: boolean | null };

type ClientUser = { id: string; role?: unknown; tenantId?: unknown; disabledAt?: unknown };

// Only a client's person (owner or office, with a tenant, not turned off) can use a device token.
// Admins keep their own password sign-in; View as client never reaches this (it is not a session).
export function clientTenant(user: ClientUser | null): string | null {
  if (!user || user.disabledAt) return null;
  if (user.role !== "owner" && user.role !== "office") return null;
  return typeof user.tenantId === "string" && user.tenantId.length > 0 ? user.tenantId : null;
}

export type DeviceSignInOptions = {
  appOrigin: string;
  // True when the tenant was uninstalled or its login is off. A throw counts as blocked.
  isTenantBlocked?: (tenantId: string) => Promise<boolean>;
  // The business name the preview shows (null or a throw: no name is shown).
  describeTenant?: (tenantId: string) => Promise<string | null>;
};

export function deviceSignInPlugin(options: DeviceSignInOptions): BetterAuthPlugin {
  const blocked = async (tenantId: string) => {
    if (!options.isTenantBlocked) return false;
    try {
      return await options.isTenantBlocked(tenantId);
    } catch {
      return true;
    }
  };
  const isRateLimited = (path: string) => path === "/device-sign-in" || path === "/device-sign-in-preview" || path === "/device-pairing";
  return {
    id: "device-sign-in",
    rateLimit: [{ pathMatcher: isRateLimited, window: RATE_WINDOW_SECONDS, max: RATE_MAX_REQUESTS }],
    endpoints: {
      // Redeem a handoff or pairing token on this device.
      deviceSignIn: createAuthEndpoint("/device-sign-in", { method: "POST" }, async (ctx) => {
        ctx.setHeader("cache-control", "no-store");
        // One fixed answer for every failure: the browser never learns which check failed.
        const refuse = (reason: string, kind?: DeviceTokenKind) => {
          audit("device_sign_in", { outcome: "denied", reason, ...(kind ? { kind } : {}) });
          return new APIError("FORBIDDEN", { message: "Forbidden" });
        };
        if (ctx.request?.headers.get("origin") !== options.appOrigin) throw refuse("origin");
        const token = (ctx.body as { token?: unknown } | null)?.token;
        if (!isDeviceToken(token)) throw refuse("bad_request");
        const grant = await consumeDeviceToken(ctx.context.internalAdapter as unknown as InternalAdapter, token);
        if (!grant) throw refuse("invalid_or_used");
        const user = (await ctx.context.internalAdapter.findUserById(grant.userId)) as (ClientUser & { email: string; name: string }) | null;
        if (!user) throw refuse("no_user", grant.kind);
        // The account must still be this tenant's person: a token never follows a moved account.
        if (clientTenant(user) !== grant.tenantId) throw refuse("wrong_user", grant.kind);
        if (await blocked(grant.tenantId)) throw refuse("tenant_blocked", grant.kind);
        // The session create hook (api/auth.ts) also refuses a turned-off user or a blocked tenant.
        const session = await ctx.context.internalAdapter.createSession(grant.userId, false).catch(() => null);
        if (!session) throw refuse("no_session", grant.kind);
        // A first-party session: SameSite=Lax (Better Auth's default), Secure on https, HttpOnly, the
        // long lifetime. It also expires an old "do not remember" cookie left by the framed sign-in.
        await setSessionCookie(ctx, { session, user: user as never }, false);
        audit("device_sign_in", { outcome: "ok", kind: grant.kind, userId: grant.userId, tenantId: grant.tenantId });
        return ctx.json({ ok: true });
      }),
      // Who and which business a token signs in, before the tap. Same checks as the redeem, nothing spent,
      // no cookie set. The same fixed 403 for every refusal; a database error is a 500 instead, so it
      // never reads as an expired link. Its own rate-limit bucket (Better Auth keys on address and path).
      deviceSignInPreview: createAuthEndpoint("/device-sign-in-preview", { method: "POST" }, async (ctx) => {
        ctx.setHeader("cache-control", "no-store");
        const refuse = (reason: string, kind?: DeviceTokenKind) => {
          audit("device_sign_in_preview", { outcome: "denied", reason, ...(kind ? { kind } : {}) });
          return new APIError("FORBIDDEN", { message: "Forbidden" });
        };
        if (ctx.request?.headers.get("origin") !== options.appOrigin) throw refuse("origin");
        const token = (ctx.body as { token?: unknown } | null)?.token;
        if (!isDeviceToken(token)) throw refuse("bad_request");
        const failed = () => {
          audit("device_sign_in_preview", { outcome: "error" });
          return new APIError("INTERNAL_SERVER_ERROR", { message: "Server error" });
        };
        let grant: Grant | null;
        let user: (ClientUser & { email: string }) | null;
        try {
          grant = await peekDeviceToken(ctx.context.internalAdapter as unknown as InternalAdapter, token);
          user = grant ? ((await ctx.context.internalAdapter.findUserById(grant.userId)) as (ClientUser & { email: string }) | null) : null;
        } catch {
          throw failed();
        }
        if (!grant) throw refuse("invalid_or_used");
        if (!user) throw refuse("no_user", grant.kind);
        if (clientTenant(user) !== grant.tenantId) throw refuse("wrong_user", grant.kind);
        if (await blocked(grant.tenantId)) throw refuse("tenant_blocked", grant.kind);
        let business: string | null = null;
        if (options.describeTenant) {
          try {
            // The client's admin types this name in HighLevel: same cleaning and length cap as the mail.
            business = cleanBusinessName(await options.describeTenant(grant.tenantId));
          } catch {
            business = null; // the page then names the person only
          }
        }
        const current = await getSessionFromCtx(ctx).catch(() => null);
        const sameAsCurrent = current ? current.user.id === grant.userId : null;
        const body: DeviceSignInPreview = { kind: grant.kind, person: maskEmailHint(user.email) ?? maskEmail(user.email), business, sameAsCurrent };
        audit("device_sign_in_preview", { outcome: "ok", kind: grant.kind, userId: grant.userId, tenantId: grant.tenantId, sameAsCurrent: String(sameAsCurrent) });
        return ctx.json(body);
      }),
      // A signed-in client person asks for a pairing link for another device.
      devicePairing: createAuthEndpoint("/device-pairing", { method: "POST" }, async (ctx) => {
        ctx.setHeader("cache-control", "no-store");
        const refuse = (reason: string) => {
          audit("device_pairing", { outcome: "denied", reason });
          return new APIError("FORBIDDEN", { message: "Forbidden" });
        };
        if (ctx.request?.headers.get("origin") !== options.appOrigin) throw refuse("origin");
        const current = await getSessionFromCtx(ctx).catch(() => null);
        if (!current) throw new APIError("UNAUTHORIZED", { message: "Unauthorized" });
        const user = current.user as ClientUser;
        const tenantId = clientTenant(user);
        if (!tenantId) throw refuse("not_a_client");
        if (await blocked(tenantId)) throw refuse("tenant_blocked");
        const issued = await issueDeviceToken(ctx.context.internalAdapter as unknown as InternalAdapter, { kind: "pairing", userId: user.id, tenantId });
        audit("device_pairing", { outcome: "ok", userId: user.id, tenantId });
        return ctx.json({ link: deviceSignInLink(options.appOrigin, issued.token), expiresAt: issued.expiresAt.toISOString() });
      }),
    },
  };
}
