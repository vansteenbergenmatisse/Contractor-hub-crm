import { parseEnv } from "@/shared/config";
import { decryptUserContext, findEmbedCandidate, resolveEmbedUser } from "@/features/embed";
import { searchLocationUsers } from "@/features/highlevel";
import { createAuth, createInvitedUser, type Auth } from "./auth";
import { createGuards } from "./guards";
import { readSession } from "./session";
import { checkInviteEligibility } from "./invite-check";
import { createInviteService, newInviteCode } from "./invites";
import { hitRateLimit } from "../db/rate-limit";
import { isTenantUninstalled } from "../db/tenant-status";
import {
  claimInvite,
  deleteInvite,
  emailTaken,
  findInviteByCodeHash,
  findTenantForInvite,
  insertInvite,
  releaseInvite,
} from "../db/invites";
import { createLogEmailSender } from "./email-sender";
import { prismaAuthDatabase } from "../db/auth-database";

// The /embed sign-in: decrypt HighLevel's user data with the shared secret and find the CRM user.
// The HighLevel env is read here, per call, so local dev and the build need no HighLevel values.
export async function resolveEmbedUserId(payload: string): Promise<string | null> {
  try {
    const context = decryptUserContext(payload, parseEnv("highlevel").GHL_APP_SHARED_SECRET);
    return await resolveEmbedUser(context, { findCandidate: findEmbedCandidate });
  } catch {
    return null;
  }
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
      emailSender: createLogEmailSender(),
      embedLogin: { resolveUserId: resolveEmbedUserId },
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
  return createGuards({ getSession: sessionFromRequest, isTenantUninstalled });
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
    store: { findTenant: findTenantForInvite, emailTaken, insertInvite, findInviteByCodeHash, claimInvite, releaseInvite, deleteInvite },
  });
}

// For server pages: the signed-in user from the request headers (null when signed out).
export async function currentUserFromHeaders(headers: Headers) {
  return getGuards().currentUser(new Request("https://internal.invalid/", { headers }));
}

// Per-key limits for the invite endpoints: 20 a minute per client address (preview and accept),
// 30 an hour per admin (create). Counted in Postgres so every serverless instance agrees.
const LIMITS: Record<string, { limit: number; windowMs: number }> = {
  "invite-create": { limit: 30, windowMs: 3600_000 },
  "invite-preview": { limit: 20, windowMs: 60_000 },
  "invite-accept": { limit: 20, windowMs: 60_000 },
  "tenant-login": { limit: 60, windowMs: 3600_000 },
};

export function getInviteLimiter() {
  return (key: string) => {
    const rule = LIMITS[key.split(":")[0]];
    if (!rule) return Promise.resolve(false);
    return hitRateLimit(key, rule.limit, rule.windowMs, new Date());
  };
}
