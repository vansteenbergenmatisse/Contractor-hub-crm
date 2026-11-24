import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { audit } from "./invite-routes";
import { clientTenant, issueDeviceToken } from "./device-sign-in";
import { EMBED_DENIAL_HEADER, type EmbedDenialCode } from "@/features/embed";

// Sign-in from inside HighLevel (build prompt 4.5). The browser sends the encrypted user data it got
// from HighLevel; an injected resolver decrypts it and names the CRM user (or nobody). The session
// cookie is SameSite=None; Secure because the page lives in a cross-site iframe. `Partitioned` is not
// set: HighLevel's docs do not say it is needed (test on staging). Same Origin only, fixed answers.
//
// Known limits (PROGRESS.md, security review of ticket 7): HighLevel's payload has no documented
// timestamp or nonce, so a captured payload can sign in until GHL_APP_SHARED_SECRET is rotated. To
// keep the damage small the session is a browser-session cookie that lasts one day (Better Auth's
// "do not remember me" lifetime), not the 30 days of a normal sign-in, and the endpoint is rate
// limited and audited (ids and outcome only: never the payload, the email or the location).
const MAX_PAYLOAD_LENGTH = 8192;
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_REQUESTS = 10; // proposal, not a measured number

export type EmbedLoginOptions = {
  // Returns the CRM user id for an encrypted payload, null, or { reason } to say why nobody signs in
  // (a short code for the log and the audit line, never shown to the browser). Must not throw; a
  // throw counts as null. `{ userId, tenantId }` binds the session to the tenant it was resolved for.
  resolveUserId: (payload: string) => Promise<EmbedResolution>;
  // After the session is inserted: true only if the account is still in that tenant.
  confirmSession?: (input: { userId: string; tenantId: string; sessionToken: string }) => Promise<boolean>;
  // Also answer with a single-use, 2-minute handoff token (api/device-sign-in.ts), so the framed page
  // can continue full-screen. Off unless set; a failure to make one never fails the sign-in.
  handoff?: boolean;
};

// `who`: HighLevel's user type and role from the decrypted user data (never the email or an id), used
// to tell an agency login apart and written to the refusal log line.
export type EmbedWho = { type?: string; role?: string };
export type EmbedResolution = string | null | { reason: string; who?: EmbedWho } | { userId: string; tenantId: string };

// The internal reason (log only) as the small public code the /embed page turns into a message.
// An agency login is never on a sub-account's user list; it is told by HighLevel's `type`, as in
// provisioning ("agency"). Anything not listed is "other".
export function embedDenialCode(reason: string, who?: EmbedWho): EmbedDenialCode {
  switch (reason) {
    case "not_in_location":
      return who?.type?.toLowerCase() === "agency" ? "agency_user" : "not_in_location";
    case "skipped_agency":
      return "agency_user";
    case "skipped_removed":
      return "not_in_location";
    case "tenant_login_off":
    case "skipped_login_off":
      return "login_off";
    case "location_not_installed":
    case "tenant_uninstalled":
    case "tenant_needs_reconnect":
      return "not_connected";
    case "user_disabled":
      return "user_off";
    case "skipped_conflict":
      return "account_conflict";
    default:
      return "other";
  }
}

// A type or role for the log: a short plain word, else "other" (never free text from the payload).
const logWord = (value: string | undefined) => (value === undefined ? "none" : /^[a-z_-]{1,20}$/i.test(value) ? value.toLowerCase() : "other");

export function embedLoginPlugin(options: EmbedLoginOptions & { appOrigin: string }): BetterAuthPlugin {
  return {
    id: "embed-login",
    rateLimit: [
      {
        pathMatcher: (path: string) => path === "/embed-login",
        window: RATE_WINDOW_SECONDS,
        max: RATE_MAX_REQUESTS,
      },
    ],
    endpoints: {
      embedLogin: createAuthEndpoint("/embed-login", { method: "POST" }, async (ctx) => {
        ctx.setHeader("cache-control", "no-store");
        // Fixed body only: never the user, the payload or the internal reason. The public code (no
        // email, no id) goes in a header so the /embed page can say what fixes it.
        const refuse = (reason: string, who?: EmbedWho) => {
          audit("embed_login", { outcome: "denied", reason });
          const code = embedDenialCode(reason, who);
          console.warn(`embed_login denied reason=${code} type=${logWord(who?.type)} role=${logWord(who?.role)}`);
          return new APIError("FORBIDDEN", { message: "Forbidden" }, { [EMBED_DENIAL_HEADER]: code, "cache-control": "no-store" });
        };
        if (ctx.request?.headers.get("origin") !== options.appOrigin) throw refuse("origin");
        const body = ctx.body as { payload?: unknown } | null;
        const payload = body?.payload;
        if (typeof payload !== "string" || payload.length === 0 || payload.length > MAX_PAYLOAD_LENGTH) {
          audit("embed_login", { outcome: "denied", reason: "bad_request" });
          throw new APIError("BAD_REQUEST", { message: "Invalid request" });
        }
        let resolved: EmbedResolution = null;
        try {
          resolved = await options.resolveUserId(payload);
        } catch {
          resolved = null;
        }
        if (resolved !== null && typeof resolved === "object" && "reason" in resolved) throw refuse(resolved.reason, resolved.who);
        const bound = resolved !== null && typeof resolved === "object" ? resolved : null;
        const userId = bound ? bound.userId : (resolved as string | null);
        if (!userId) throw refuse("no_match");
        const user = await ctx.context.internalAdapter.findUserById(userId);
        if (!user) throw refuse("no_user");
        // The session create hook (api/auth.ts) refuses a turned-off user: no session comes back.
        const session = await ctx.context.internalAdapter.createSession(userId, true).catch(() => null);
        if (!session) throw refuse("no_session");
        if (bound) {
          // The account may have moved to another client since it was resolved. Fails closed.
          const stillThere = await Promise.resolve()
            .then(() => options.confirmSession?.({ userId: bound.userId, tenantId: bound.tenantId, sessionToken: session.token }) ?? false)
            .catch(() => false);
          if (!stillThere) {
            await ctx.context.internalAdapter.deleteSession(session.token).catch(() => {});
            throw refuse("tenant_changed");
          }
        }
        await setSessionCookie(ctx, { session, user }, true, { sameSite: "none", secure: true });
        // Better Auth writes its "do not remember" cookie as SameSite=Lax, which a cross-site iframe
        // does not send: the next session read would then extend this one-day session to a year.
        const dontRemember = ctx.context.authCookies.dontRememberToken;
        await ctx.setSignedCookie(dontRemember.name, "true", ctx.context.secret, { ...dontRemember.attributes, sameSite: "none", secure: true });
        audit("embed_login", { outcome: "ok", userId });
        if (options.handoff) {
          // Only for the tenant this sign-in was resolved for, and only for a client's person.
          const tenantId = clientTenant(user as never);
          if (tenantId && (!bound || bound.tenantId === tenantId)) {
            const issued = await issueDeviceToken(ctx.context.internalAdapter as never, { kind: "handoff", userId, tenantId }).catch(() => null);
            if (issued) {
              audit("device_handoff", { outcome: "issued", userId, tenantId });
              return ctx.json({ ok: true, handoff: issued.token });
            }
          }
        }
        return ctx.json({ ok: true });
      }),
    },
  };
}
