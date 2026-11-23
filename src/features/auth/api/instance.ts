import { parseEnv } from "@/shared/config";
import { decryptUserContext, findEmbedCandidate, findEmbedTenant, resolveEmbedAccess } from "@/features/embed";
import { listTenantUsers, searchLocationUsers } from "@/features/highlevel";
import { createAuth, createInvitedUser, setUserDisabled, type Auth } from "./auth";
import { provisionGhlUser, type ProvisionDeps } from "./provision";
import { randomBytes } from "node:crypto";
import { applyClientView, clientViewCookieName } from "./client-view";
import { createGuards } from "./guards";
import { readSession } from "./session";
import { checkInviteEligibility } from "./invite-check";
import { createInviteService, newInviteCode } from "./invites";
import { hitRateLimit } from "../db/rate-limit";
import { isTenantLoginBlocked, isTenantLoginOff, isTenantUninstalled } from "../db/tenant-status";
import {
  claimInvite,
  deleteInvite,
  emailTaken,
  findInviteByCodeHash,
  findInvitedRole,
  findTenantForInvite,
  insertInvite,
  releaseInvite,
} from "../db/invites";
import { createEmailSenderFromEnv, createLogEmailSender } from "./email-sender";
import { findLink, findLinkByUserId, findUserByEmail, findUserById, insertLink, relinkUser, setLinkDeleted } from "../db/ghl-links";
import { prismaAuthDatabase } from "../db/auth-database";
import { createMoveStore } from "../db/account-move";
import { readSourceUnproven } from "./account-move";
import type { EmbedResolution } from "./embed-login";

// The /embed sign-in: decrypt HighLevel's user data with the shared secret, find the CRM user, and,
// when the sub-account is installed but the person has no account yet, check with HighLevel that
// they belong to it and create the account on the spot (same mapping as the onboarding sync). The
// HighLevel env is read here, per call, so local dev and the build need no HighLevel values.
// Log lines carry step names, reason codes and key names only: no email, no ids, no payload.
export async function resolveEmbedLogin(payload: string, options: { provision?: boolean } = {}): Promise<string | null | { reason: string }> {
  const result = await resolveEmbedSession(payload, options);
  return result !== null && typeof result === "object" && "userId" in result ? result.userId : (result as string | null | { reason: string });
}

// The same, naming the tenant the sign-in is for, so the session can be bound to it.
async function resolveEmbedSession(payload: string, options: { provision?: boolean } = {}): Promise<EmbedResolution> {
  let context;
  try {
    context = decryptUserContext(payload, parseEnv("highlevel").GHL_APP_SHARED_SECRET);
  } catch {
    console.info(JSON.stringify({ audit: "embed_resolve", step: "decrypt", ok: false }));
    return options.provision === false ? null : { reason: "decrypt_failed" };
  }
  const present = Object.entries(context).filter(([, v]) => v !== undefined).map(([k]) => k).sort().join(",");
  console.info(JSON.stringify({ audit: "embed_resolve", step: "decrypt", ok: true, fields: present }));
  const access = await resolveEmbedAccess(context, { findCandidate: findEmbedCandidate, findTenant: findEmbedTenant });
  if (access.kind === "user") {
    if (options.provision === false) return access.userId; // a plain lookup: no session follows
    const tenant = await findEmbedTenant(context.activeLocation).catch(() => null);
    return tenant ? { userId: access.userId, tenantId: tenant.tenantId } : { reason: "lookup_failed" };
  }
  if (access.kind === "denied") {
    console.info(JSON.stringify({ audit: "embed_resolve", step: "access", reason: access.reason }));
    return options.provision === false ? null : { reason: access.reason };
  }
  if (options.provision === false) return null;
  try {
    // HighLevel is the source of truth for who belongs to the sub-account (and the payload's `type`
    // is not reliable, see hl-api-notes.md).
    const users = await listTenantUsers(access.tenantId);
    const match = users.find((user) => !user.deleted && user.email.trim().toLowerCase() === context.email);
    if (!match) return { reason: "not_in_location" };
    const result = await provisionGhlUser(getProvisionDeps(), {
      tenantId: access.tenantId,
      ghlUserId: match.id,
      email: context.email,
      name: match.name,
      ghlRole: match.role,
      ghlRoleType: match.roleType,
      // A HighLevel-signed sign-in for this location, and the location lists the person.
      moveProof: { kind: "embed", readSourceEmails: readSourceUnproven },
    });
    console.info(JSON.stringify({ audit: "embed_resolve", step: "provision", outcome: result.outcome }));
    return result.userId ? { userId: result.userId, tenantId: access.tenantId } : { reason: result.outcome };
  } catch (error) {
    console.error("Embed provisioning failed:", error instanceof Error ? error.name : "unknown error");
    return { reason: "provision_failed" };
  }
}

// Kept for callers that want a plain id or null (no account is created).
export async function resolveEmbedUserId(payload: string): Promise<string | null> {
  const result = await resolveEmbedLogin(payload, { provision: false });
  return typeof result === "string" ? result : null;
}

// What provisioning needs, bound to the real auth instance and the database.
export function getProvisionDeps(): ProvisionDeps {
  const auth = getAuth();
  const env = parseEnv("auth");
  return {
    createUser: (input) => createInvitedUser(auth, input),
    async updateUser(userId, patch) {
      const context = await auth.$context;
      await context.internalAdapter.updateUser(userId, patch as never);
    },
    setDisabled: (userId, disabled) => setUserDisabled(auth, userId, disabled),
    async sendSetPassword(email) {
      // Mail to the people of a real client is OFF until ONBOARDING_SEND_SET_PASSWORD is "true"
      // (loop-constraints.md rules 12 and 13: no mail to the JCR owner). Accounts are created either way.
      if (process.env.ONBOARDING_SEND_SET_PASSWORD?.trim() !== "true") {
        console.info("Onboarding: set-password mail skipped (ONBOARDING_SEND_SET_PASSWORD is not true)");
        return;
      }
      // The redirect must be on the Better Auth base URL, which is its only trusted origin.
      await auth.api.requestPasswordReset({ body: { email, redirectTo: `${env.BETTER_AUTH_URL}/reset-password` } });
    },
    randomPassword: () => randomBytes(32).toString("base64url"),
    store: { findLink, findLinkByUserId, relinkUser, insertLink, setLinkDeleted, findUserByEmail, findUserById, isTenantLoginOff, findInvitedRole },
    now: () => new Date(),
    moves: createMoveStore(),
  };
}

// Built on first use, never at import: `next build` needs no env and no database.
let instance: Auth | undefined;

// Throws when the auth env is incomplete; the message names variables, never values.
export function getAuth(): Auth {
  if (!instance) {
    const env = parseEnv("auth");
    instance = createAuth({
      database: prismaAuthDatabase(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      emailSender: createEmailSenderFromEnv(),
      embedLogin: {
        resolveUserId: (payload) => resolveEmbedSession(payload),
        confirmSession: (input) => createMoveStore().confirmSessionTenant(input),
      },
      isTenantBlocked: isTenantLoginBlocked,
      clearUnusedMarker: (userId) => createMoveStore().clearMarker(userId),
    });
  }
  return instance;
}

// The route handler behind /api/auth/*. A missing env answers 500 with no detail.
export async function authRoute(request: Request): Promise<Response> {
  let auth: Auth;
  try {
    auth = getAuth();
  } catch (error) {
    console.error("Auth route:", error instanceof Error ? error.message : "invalid env");
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
  return auth.handler(request);
}

// Guards for the route files in src/app. The session is read lazily and any failure (missing env,
// database down) means "not signed in".
const sessionFromRequest = (request: Request) => readSession(getAuth(), request.headers);

export function getGuards() {
  return createGuards({ getSession: sessionFromRequest, isTenantUninstalled: isTenantLoginBlocked });
}

// Invites, built per call (cheap). The log-only sender means no real email goes out for now.
export function getInviteService() {
  const env = parseEnv("auth");
  const auth = getAuth();
  return createInviteService({
    now: () => new Date(),
    newCode: newInviteCode,
    appUrl: env.APP_URL,
    emailSender: createLogEmailSender(),
    checkEligibility: (tenant, email) =>
      checkInviteEligibility(
        { email, companyId: tenant.companyId as string, locationId: tenant.locationId }, // createInvite refuses a tenant with no companyId
        { searchUsers: (query) => searchLocationUsers(tenant.id, query) },
      ),
    createUser: (input) => createInvitedUser(auth, input),
    links: { find: findLink, insert: insertLink },
    store: { findTenant: findTenantForInvite, emailTaken, insertInvite, findInviteByCodeHash, claimInvite, releaseInvite, deleteInvite },
  });
}

// For server pages: the signed-in user from the request headers (null when signed out).
// An admin with a valid View as client cookie gets that client's tenant here, for reading pages only:
// API routes use the guards, which never see it.
export async function currentUserFromHeaders(headers: Headers) {
  const user = await getGuards().currentUser(new Request("https://internal.invalid/", { headers }));
  if (user?.role !== "admin") return user;
  try {
    const env = parseEnv("auth");
    const name = clientViewCookieName(new URL(env.APP_URL).origin);
    const value = (headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return await applyClientView(user, value, clientViewDeps(env.BETTER_AUTH_SECRET));
  } catch {
    return user;
  }
}

export const clientViewDeps = (secret: string) => ({
  secret,
  now: () => new Date(),
  isTenantUnavailable: isTenantUninstalled,
  disabled: process.env.CLIENT_VIEW_DISABLED?.trim() === "true",
});

// Per-key limits for the invite endpoints: 20 a minute per client address (preview and accept),
// 30 an hour per admin (create). Counted in Postgres so every serverless instance agrees.
const LIMITS: Record<string, { limit: number; windowMs: number }> = {
  "invite-create": { limit: 30, windowMs: 3600_000 },
  "invite-preview": { limit: 20, windowMs: 60_000 },
  "invite-accept": { limit: 20, windowMs: 60_000 },
  "tenant-login": { limit: 60, windowMs: 3600_000 },
  "client-view": { limit: 60, windowMs: 3600_000 },
};

export function getInviteLimiter() {
  return (key: string) => {
    const rule = LIMITS[key.split(":")[0]];
    if (!rule) return Promise.resolve(false);
    return hitRateLimit(key, rule.limit, rule.windowMs, new Date());
  };
}
