import { betterAuth } from "better-auth";
import type { EmailSender } from "./email-sender";
import { embedLoginPlugin, type EmbedLoginOptions } from "./embed-login";
import { normalizeEmail } from "./invite-check";
import { isRole, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type Role } from "../types";

// Better Auth, email and password only, invite only: the public sign-up endpoint is closed and a
// user is created by `createInvitedUser` after an invite is accepted. The role, the tenant and the
// off switch are server-only fields: `input: false` stops a user from setting them.
// One year, renewed once a day while the session is used (updateAge): a person logs in once at
// onboarding and stays signed in. Browsers cap a cookie's lifetime at about 400 days.
const LONG_SESSION_SECONDS = 60 * 60 * 24 * 365;
// 24 hours: the same link is the "set your password" mail a new user gets.
const RESET_TOKEN_SECONDS = 60 * 60 * 24;

export type CreateAuthOptions = {
  // A Better Auth database adapter: the Prisma adapter in production, the memory adapter in tests.
  database: Parameters<typeof betterAuth>[0]["database"];
  secret: string;
  baseURL: string;
  emailSender: EmailSender;
  // Sign-in from inside HighLevel (the /embed page). Left out, the endpoint does not exist.
  embedLogin?: EmbedLoginOptions;
  // True when the user's tenant was uninstalled in HighLevel: no new session is created for them.
  isTenantBlocked?: (tenantId: string) => Promise<boolean>;
};

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    database: options.database,
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [options.baseURL],
    plugins: options.embedLogin
      ? [embedLoginPlugin({ ...options.embedLogin, appOrigin: new URL(options.baseURL).origin })]
      : [],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      requireEmailVerification: false, // the invite already proved the email is a HighLevel user
      resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await options.emailSender.send({
          kind: "password_reset",
          to: user.email,
          subject: "Set your password",
          text: `Open this link within 24 hours to choose your password:\n${url}\n\nIf you did not ask for this, ignore this message.`,
        });
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
