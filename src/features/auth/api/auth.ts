import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { encodeSignInHint, maskEmailHint, SIGN_IN_HINT_COOKIE, SIGN_IN_HINT_MAX_AGE_SECONDS } from "./sign-in-hint";
import type { EmailSender } from "./email-sender";
import { embedLoginPlugin, type EmbedLoginOptions } from "./embed-login";
import { deviceSignInPlugin } from "./device-sign-in";
import { normalizeEmail } from "./invite-check";
import { SET_PASSWORD_LINK_HOURS, setPasswordEmail } from "./set-password-email";
import { isRole, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type Role } from "../types";

// Better Auth, email and password only, invite only: the public sign-up endpoint is closed and a
// user is created by `createInvitedUser` after an invite is accepted. The role, the tenant and the
// off switch are server-only fields: `input: false` stops a user from setting them.
// One year, renewed once a day while the session is used (updateAge): a person logs in once at
// onboarding and stays signed in. Browsers cap a cookie's lifetime at about 400 days.
const LONG_SESSION_SECONDS = 60 * 60 * 24 * 365;
// 24 hours: the same link is the "set your password" mail a new user gets.
const RESET_TOKEN_SECONDS = 60 * 60 * SET_PASSWORD_LINK_HOURS;

export type CreateAuthOptions = {
  // A Better Auth database adapter: the Prisma adapter in production, the memory adapter in tests.
  database: Parameters<typeof betterAuth>[0]["database"];
  secret: string;
  baseURL: string;
  emailSender: EmailSender;
  // Sign-in from inside HighLevel (the /embed page). Left out, the endpoint does not exist.
  embedLogin?: EmbedLoginOptions;
  // True when the user's tenant was uninstalled or its login is off: no new session is created for them.
  isTenantBlocked?: (tenantId: string) => Promise<boolean>;
  // Removes the "never used" marker before a session is created. A failure never blocks sign-in.
  clearUnusedMarker?: (userId: string) => Promise<void>;
  // The business name for the set-password mail and the /device-sign-in preview. Left out, or failing,
  // they name no business.
  tenantName?: (tenantId: string) => Promise<string | null>;
  // Where people sign in (the mail names it). Defaults to baseURL.
  appUrl?: string;
  // "Open on this device": handoff from the /embed sign-in and pairing by QR code or link
  // (api/device-sign-in.ts). Left out, those endpoints do not exist and /embed gives no handoff.
  deviceSignIn?: boolean;
  // The way back after a long session ends (api/sign-in-hint.ts): the personal-link slug of a tenant,
  // or null. Left out, no hint cookie is written.
  signInHint?: { slugForTenant: (tenantId: string) => Promise<string | null> };
};

// Where a session is created for a person: password sign-in, the device sign-in (full-screen handoff
// from HighLevel, or pairing) and /embed-login inside HighLevel's frame, so someone who only ever uses
// the CRM inside HighLevel also gets the hint.
const HINT_PATHS = new Set(["/sign-in/email", "/device-sign-in", "/embed-login"]);
// /embed-login answers inside HighLevel's cross-site frame, where a SameSite=Lax cookie is dropped by
// the browser: that one is SameSite=None; Secure (it still grants nothing).
const FRAMED_HINT_PATHS = new Set(["/embed-login"]);

function signInHintHook(options: CreateAuthOptions) {
  const hint = options.signInHint;
  const secure = new URL(options.baseURL).protocol === "https:";
  return createAuthMiddleware(async (ctx) => {
    if (!hint) return;
    if (ctx.path === "/sign-out") {
      // Shared devices: an explicit sign-out forgets which email was used here. SameSite=None where
      // possible, so the clear also works when sign-out runs inside HighLevel's frame.
      ctx.setCookie(SIGN_IN_HINT_COOKIE, "", { httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: "/", maxAge: 0 });
      return;
    }
    if (!HINT_PATHS.has(ctx.path)) return;
    const created = ctx.context.newSession;
    const user = created?.user as { email?: string; role?: string; tenantId?: string | null } | undefined;
    // Only a client's person (owner or office) with a tenant; never Forge Forward staff.
    if (!user?.email || !user.tenantId || (user.role !== "owner" && user.role !== "office")) return;
    // The hint is a convenience: a failure never touches the sign-in.
    try {
      const slug = await hint.slugForTenant(user.tenantId).catch(() => null);
      if (!maskEmailHint(user.email)) return;
      const framed = FRAMED_HINT_PATHS.has(ctx.path);
      ctx.setCookie(SIGN_IN_HINT_COOKIE, encodeSignInHint({ slug, email: user.email }), {
        httpOnly: true,
        secure: framed ? true : secure,
        sameSite: framed ? "none" : "lax",
        path: "/",
        maxAge: SIGN_IN_HINT_MAX_AGE_SECONDS,
      });
    } catch {
      // nothing: no hint this time
    }
  });
}

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    database: options.database,
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [options.baseURL],
    plugins: [
      ...(options.embedLogin
        ? [embedLoginPlugin({ handoff: options.deviceSignIn === true, ...options.embedLogin, appOrigin: new URL(options.baseURL).origin })]
        : []),
      ...(options.deviceSignIn ? [deviceSignInPlugin({ appOrigin: new URL(options.baseURL).origin, isTenantBlocked: options.isTenantBlocked, describeTenant: options.tenantName })] : []),
    ],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      requireEmailVerification: false, // the invite already proved the email is a HighLevel user
      resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // Forgot password and the onboarding sync's set-password mail. Through the injected sender, which
      // in production is the delivery guard (createEmailSenderFromEnv).
      sendResetPassword: async ({ user, url }) => {
        const tenantId = (user as { tenantId?: string | null }).tenantId;
        let tenantName: string | null = null;
        if (tenantId && options.tenantName) {
          try {
            tenantName = await options.tenantName(tenantId);
          } catch {
            tenantName = null; // the mail still goes, without the business name
          }
        }
        await options.emailSender.send(
          setPasswordEmail({
            to: user.email,
            tenantName,
            link: url,
            appUrl: options.appUrl ?? options.baseURL,
            expiresAt: new Date(Date.now() + RESET_TOKEN_SECONDS * 1000),
          }),
        );
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, input: false, defaultValue: "owner" },
        tenantId: { type: "string", required: false, input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    // Column names that do not look like provider tokens (see the auth section of schema.prisma).
    session: {
      expiresIn: LONG_SESSION_SECONDS,
      updateAge: 60 * 60 * 24,
      fields: { token: "sessionKey" },
    },
    account: {
      fields: {
        accessToken: "oauthAccess",
        refreshToken: "oauthRefresh",
        idToken: "oauthId",
        accessTokenExpiresAt: "oauthAccessExpiresAt",
        refreshTokenExpiresAt: "oauthRefreshExpiresAt",
      },
    },
    rateLimit: { enabled: true, storage: "database" },
    hooks: { after: signInHintHook(options) },
    // On Vercel the platform sets these headers; the first is not forgeable by the client.
    advanced: { ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"] } },
    databaseHooks: {
      session: {
        create: {
          // A turned-off user gets no new session.
          before: async (session, context) => {
            const found = await context?.context.internalAdapter.findUserById(session.userId);
            const user = found as { disabledAt?: Date | null; tenantId?: string | null } | null;
            if (user?.disabledAt) return false;
            if (user?.tenantId && options.isTenantBlocked) {
              try {
                if (await options.isTenantBlocked(user.tenantId)) return false;
              } catch {
                return false; // fail closed
              }
            }
            if (options.clearUnusedMarker) {
              try {
                await options.clearUnusedMarker(session.userId);
              } catch (error) {
                // A stale marker is safe: a move also refuses on any session or changed password.
                const code = (error as { code?: unknown } | null)?.code;
                console.error(`Auth: unused marker not cleared: ${typeof code === "string" && /^P\d{4}$/.test(code) ? code : error instanceof Error ? error.name : "unknown error"}`);
              }
            }
            return { data: session };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export type InvitedUserInput = {
  email: string;
  name: string;
  password: string;
  role: Role;
  tenantId: string | null;
};

// The only way a user is created. Owners and office users need a tenant; an admin (Forge Forward
// staff) must have none. Throws on a bad input or a duplicate email; messages carry no values.
export async function createInvitedUser(auth: Auth, input: InvitedUserInput): Promise<{ userId: string }> {
  if (!isRole(input.role)) throw new Error("Invalid role.");
  const hasTenant = typeof input.tenantId === "string" && input.tenantId.length > 0;
  if (input.role === "admin" ? input.tenantId !== null : !hasTenant) {
    throw new Error("Role and tenant do not match.");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH || input.password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password length is not allowed.");
  }
  const email = normalizeEmail(input.email);
  const context = await auth.$context;
  if (await context.internalAdapter.findUserByEmail(email, undefined)) throw new Error("A user with this email exists.");
  const user = await context.internalAdapter.createUser({
    email,
    name: input.name,
    emailVerified: true,
    role: input.role,
    tenantId: input.tenantId,
  } as never, { method: "email-password" });
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await context.password.hash(input.password),
  });
  return { userId: user.id };
}

// "Turn off login" (admin page). Turning off also ends every session of the user.
export async function setUserDisabled(auth: Auth, userId: string, disabled: boolean): Promise<void> {
  const context = await auth.$context;
  await context.internalAdapter.updateUser(userId, { disabledAt: disabled ? new Date() : null } as never);
  if (disabled) {
    const sessions = await context.internalAdapter.listSessions(userId, undefined);
    if (sessions.length > 0) await context.internalAdapter.deleteSessions(sessions.map((s) => s.token));
  }
}
