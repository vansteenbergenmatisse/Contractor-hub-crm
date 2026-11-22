import { randomUUID } from "node:crypto";
import { parseEnv, type EnvValues } from "@/shared/config";
import { createHighLevelClient } from "./client";
import { searchUsersWithRetry } from "./search-users";
import { listCustomValuesWithRetry, readCustomValuesWithStoredToken } from "./custom-values";
import { listLocationUsersWithRetry } from "./location-users";
import { CONTACTS_PAGE_SIZE, readContactsPage, readContactsThrottled } from "./contacts";
import type { AgencyLocation, ContactsRead, CustomValue, HighLevelUser, InstalledLocation, SaveLocationConnectionInput, SearchUsersQuery } from "../types";
import { createTokenService } from "./token-service";
import { handleOAuthStart } from "./start";
import { resolveScopes } from "./scopes";
import { handleOAuthCallback, type OAuthCallbackDeps } from "./callback";
import { handleWebhook } from "./webhook";
import {
  deleteAgencyConnection,
  markLocationUninstalled,
  readLocationCompanyId,
  saveAgencyConnection,
  saveLocationConnection,
} from "../db/connections";
import {
  readAgencyState,
  readLocationState,
  updateAgencyLocked,
  updateLocationLocked,
} from "../db/token-store";
import { beginWebhookEvent, markWebhookProcessed } from "../db/webhook-events";
import { findTenantByLocation, listAgencyCompanyIds, listConnectedTenants, updateTenantName } from "../db/onboarding";
import type { WebhookHooks } from "./webhook";

// Wiring for the two OAuth routes in src/app. Env is read per request (lazy), so `next build`
// needs none. A missing or malformed env answers 500 with no detail; the names are logged.
function notConfigured(error: unknown): Response {
  console.error("HighLevel routes: ", error instanceof Error ? error.message : "invalid env");
  return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
}

function buildClient(env: EnvValues<"highlevel">) {
  return createHighLevelClient({
    baseUrl: env.GHL_API_BASE_URL,
    appId: env.GHL_APP_ID,
    clientId: env.GHL_CLIENT_ID,
    clientSecret: env.GHL_CLIENT_SECRET,
    redirectUri: env.GHL_REDIRECT_URI,
  });
}

function buildTokenService(env: EnvValues<"highlevel">, client = buildClient(env)) {
  const key = env.TOKEN_ENCRYPTION_KEY;
  return createTokenService({
    client,
    store: {
      readLocationState: (tenantId) => readLocationState(tenantId, key),
      readAgencyState: (companyId) => readAgencyState(companyId, key),
      updateLocationLocked: (tenantId, decide) => updateLocationLocked(tenantId, key, decide),
      updateAgencyLocked: (companyId, decide) => updateAgencyLocked(companyId, key, decide),
    },
    now: () => new Date(),
  });
}

// The token service for other features (they call HighLevel only through it). Throws when the
// environment is incomplete; the message names variables, never values.
export function getTokenService() {
  return buildTokenService(parseEnv("highlevel"));
}

// The admin check is injected by the route file in src/app (it needs the auth feature, which
// imports this one). Without a guard nobody is an admin: /start and /callback fail closed.
export type AdminGuard = {
  isAdmin: (request: Request) => Promise<boolean>;
  adminId: (request: Request) => Promise<string | null>;
};

const noAdmin = async () => false;

// Users of one sub-account for the invite check. The tenant id comes from the server (the invite
// service loads it from the database), never from request input. One refresh-and-retry on a 401.
export async function searchLocationUsers(
  tenantId: string,
  query: SearchUsersQuery,
): Promise<HighLevelUser[]> {
  const env = parseEnv("highlevel");
  const client = buildClient(env);
  const tokens = buildTokenService(env, client);
  return searchUsersWithRetry({ getLocationToken: tokens.getLocationToken, searchUsers: client.searchUsers }, tenantId, query);
}

// Users of one sub-account as HighLevel lists them now (the source of truth for the CRM's users).
export async function listTenantUsers(tenantId: string): Promise<HighLevelUser[]> {
  const env = parseEnv("highlevel");
  const client = buildClient(env);
  const tokens = buildTokenService(env, client);
  const state = await readLocationState(tenantId, env.TOKEN_ENCRYPTION_KEY);
  if (!state) throw new Error("Tenant has no HighLevel connection.");
  return listLocationUsersWithRetry(
    { getLocationToken: tokens.getLocationToken, listLocationUsers: client.listLocationUsers },
    tenantId,
    state.companyId,
    state.locationId,
  );
}

// Everything the onboarding feature needs from HighLevel and the token store, in one object so that
// feature never builds a client or touches a token. Throws when the highlevel env is incomplete.
export type OnboardingApi = {
  companyIds(): Promise<string[]>;
  // Null when this agency has no usable token (uninstalled, or refresh refused).
  agency(companyId: string): Promise<{ installed(): Promise<InstalledLocation[]>; locations(): Promise<AgencyLocation[]>; connect(locationId: string, name: string | null): Promise<{ tenantId: string; accessToken: string }> } | null>;
  connectedTenants(companyId: string): Promise<Array<{ tenantId: string; locationId: string }>>;
  findTenant(locationId: string): Promise<{ tenantId: string; companyId: string | null; status: string } | null>;
  usersOfTenant(tenantId: string): Promise<HighLevelUser[]>;
  usersWithToken(accessToken: string, companyId: string, locationId: string): Promise<HighLevelUser[]>;
  renameTenant(locationId: string, name: string): Promise<boolean>;
  // A Location token that arrived straight from the install (single sub-account install).
  saveLocationToken(input: SaveLocationConnectionInput): Promise<{ tenantId: string }>;
};

export function getOnboardingApi(): OnboardingApi {
  const env = parseEnv("highlevel");
  const client = buildClient(env);
  const tokens = buildTokenService(env, client);
  return {
    companyIds: listAgencyCompanyIds,
    async agency(companyId) {
      const token = await tokens.findAgencyToken(companyId);
      if (!token) return null;
      return {
        installed: () => client.listInstalledLocations(token, companyId),
        locations: () => client.listAgencyLocations(token, companyId),
        async connect(locationId, name) {
          const minted = await client.mintLocationToken(token, companyId, locationId);
          const saved = await saveLocationConnection(
            { locationId, companyId, name, accessToken: minted.accessToken, refreshToken: minted.refreshToken, expiresAt: new Date(Date.now() + minted.expiresInSeconds * 1000) },
            env.TOKEN_ENCRYPTION_KEY,
          );
          return { tenantId: saved.tenantId, accessToken: minted.accessToken };
        },
      };
    },
    connectedTenants: listConnectedTenants,
    findTenant: findTenantByLocation,
    usersOfTenant: listTenantUsers,
    usersWithToken: (accessToken, companyId, locationId) => client.listLocationUsers(accessToken, companyId, locationId),
    renameTenant: updateTenantName,
    saveLocationToken: (input) => saveLocationConnection(input, env.TOKEN_ENCRYPTION_KEY),
  };
}

// The brand source: the sub-account's custom values (scope locations/customValues.readonly).
export async function listTenantCustomValues(tenantId: string): Promise<CustomValue[]> {
  const env = parseEnv("highlevel");
  const client = buildClient(env);
  const tokens = buildTokenService(env, client);
  return listCustomValuesWithRetry(
    {
      getLocationToken: tokens.getLocationToken,
      readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
      listCustomValues: client.listCustomValues,
    },
    tenantId,
  );
}

// Custom values for a signed-out page: the stored token only, never a refresh or a state change.
export async function readTenantCustomValuesStored(tenantId: string): Promise<CustomValue[] | null> {
  const env = parseEnv("highlevel");
  const client = buildClient(env);
  return readCustomValuesWithStoredToken(
    {
      readState: (id) => readLocationState(id, env.TOKEN_ENCRYPTION_KEY),
      listCustomValues: client.listCustomValues,
      now: () => new Date(),
    },
    tenantId,
  );
}

// One page of the tenant's newest contacts, read-only. The tenant id comes from the server session.
// Never throws: a failure is an answer the page can show.
export async function readTenantContacts(tenantId: string): Promise<ContactsRead> {
  let env: EnvValues<"highlevel">;
  try {
    env = parseEnv("highlevel");
  } catch {
    console.error("HighLevel contacts read failed: step=env");
    return { ok: false, reason: "unavailable" };
  }
  const client = buildClient(env);
  const tokens = buildTokenService(env, client);
  return readContactsPage(
    {
      readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
      withLocationToken: tokens.withLocationToken,
      requestContactSearch: client.requestContactSearch,
    },
    tenantId,
    CONTACTS_PAGE_SIZE,
  );
}

// The contacts read behind a per-tenant limit. The limiter is injected because auth, which owns
// hitRateLimit, already imports this feature.
export function createTenantContactsReader(
  hit: (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>,
): (tenantId: string) => Promise<ContactsRead> {
  return (tenantId) => readContactsThrottled({ hit, read: readTenantContacts, now: () => new Date() }, tenantId);
}

export async function oauthStartRoute(request: Request, guard?: AdminGuard): Promise<Response> {
  let env;
  try {
    env = parseEnv("highlevel");
  } catch (error) {
    return notConfigured(error);
  }
  return handleOAuthStart(request, {
    config: {
      installBaseUrl: env.GHL_INSTALL_BASE_URL,
      clientId: env.GHL_CLIENT_ID,
      redirectUri: env.GHL_REDIRECT_URI,
      versionId: process.env.GHL_APP_VERSION_ID,
      scopes: resolveScopes(process.env.GHL_OAUTH_SCOPES),
    },
    isAdmin: guard?.isAdmin ?? noAdmin,
    getAdminId: guard?.adminId,
    stateSecret: env.TOKEN_ENCRYPTION_KEY,
  });
}

export async function oauthCallbackRoute(request: Request, guard?: AdminGuard, onboard?: OAuthCallbackDeps["onboard"]): Promise<Response> {
  let env;
  try {
    env = parseEnv("highlevel");
  } catch (error) {
    return notConfigured(error);
  }
  const client = buildClient(env);
  return handleOAuthCallback(request, {
    client,
    exchangeCode: client.exchangeCode,
    store: {
      saveAgencyConnection: (input) => saveAgencyConnection(input, env.TOKEN_ENCRYPTION_KEY),
      saveLocationConnection: (input) => saveLocationConnection(input, env.TOKEN_ENCRYPTION_KEY),
    },
    now: () => new Date(),
    stateSecret: env.TOKEN_ENCRYPTION_KEY,
    currentAdminId: guard?.adminId,
    onboard,
  });
}

// publicKeyPem is for tests only; production uses HighLevel's published key.
export function createWebhookRoute(options: { publicKeyPem?: string; hooks?: WebhookHooks } = {}) {
  return (request: Request) => handleWebhookRequest(request, options.publicKeyPem, options.hooks);
}

export const webhookRoute = createWebhookRoute();

async function handleWebhookRequest(request: Request, publicKeyPem: string | undefined, hooks?: WebhookHooks): Promise<Response> {
  let env;
  try {
    env = parseEnv("highlevel");
  } catch (error) {
    return notConfigured(error);
  }
  const client = buildClient(env);
  const tokens = buildTokenService(env, client);
  return handleWebhook(request, {
    appId: env.GHL_APP_ID,
    publicKeyPem,
    now: () => new Date(),
    newId: () => randomUUID(),
    store: {
      begin: beginWebhookEvent,
      markProcessed: markWebhookProcessed,
      readAgencyAccessToken: (companyId) => tokens.findAgencyToken(companyId),
      saveLocationConnection: (input) => saveLocationConnection(input, env.TOKEN_ENCRYPTION_KEY),
      markLocationUninstalled,
      deleteAgencyConnection,
    },
    client,
    hooks,
    reconcile: {
      listInstalledLocations: client.listInstalledLocations,
      readLocationCompanyId,
    },
  });
}
