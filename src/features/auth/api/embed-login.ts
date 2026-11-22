import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";

// Sign-in from inside HighLevel (build prompt 4.5). The browser sends the encrypted user data it got
// from HighLevel; an injected resolver decrypts it and names the CRM user (or nobody). The session
// cookie is SameSite=None; Secure because the page lives in a cross-site iframe. `Partitioned` is not
// set: HighLevel's docs do not say it is needed (test on staging). Same Origin only, fixed answers.
const MAX_PAYLOAD_LENGTH = 8192;

export type EmbedLoginOptions = {
  // Returns the CRM user id for an encrypted payload, or null. Must not throw; a throw counts as null.
  resolveUserId: (payload: string) => Promise<string | null>;
};

export function embedLoginPlugin(options: EmbedLoginOptions & { appOrigin: string }): BetterAuthPlugin {
  return {
    id: "embed-login",
    endpoints: {
      embedLogin: createAuthEndpoint("/embed-login", { method: "POST" }, async (ctx) => {
        ctx.setHeader("cache-control", "no-store");
        // Fixed messages only: never the user, the payload or the reason.
        const forbidden = () => new APIError("FORBIDDEN", { message: "Forbidden" });
        if (ctx.request?.headers.get("origin") !== options.appOrigin) throw forbidden();
        const body = ctx.body as { payload?: unknown } | null;
        const payload = body?.payload;
        if (typeof payload !== "string" || payload.length === 0 || payload.length > MAX_PAYLOAD_LENGTH) {
          throw new APIError("BAD_REQUEST", { message: "Invalid request" });
        }
        let userId: string | null = null;
        try {
          userId = await options.resolveUserId(payload);
        } catch {
          userId = null;
        }
        if (!userId) throw forbidden();
        const user = await ctx.context.internalAdapter.findUserById(userId);
        if (!user) throw forbidden();
        // The session create hook (api/auth.ts) refuses a turned-off user: no session comes back.
        const session = await ctx.context.internalAdapter.createSession(userId).catch(() => null);
        if (!session) throw forbidden();
        await setSessionCookie(ctx, { session, user }, false, { sameSite: "none", secure: true });
        return ctx.json({ ok: true });
      }),
    },
  };
}
