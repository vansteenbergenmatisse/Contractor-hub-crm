import { randomUUID } from "node:crypto";
import { parseEnv, type EnvValues } from "@/shared/config";
import { createHighLevelClient } from "./client";
import { searchUsersWithRetry } from "./search-users";
import type { HighLevelUser, SearchUsersQuery } from "../types";
import { createTokenService } from "./token-service";
import { handleOAuthStart } from "./start";
import { handleOAuthCallback } from "./callback";
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
    },
    isAdmin: guard?.isAdmin ?? noAdmin,
    getAdminId: guard?.adminId,
    stateSecret: env.TOKEN_ENCRYPTION_KEY,
  });
}

export async function oauthCallbackRoute(request: Request, guard?: AdminGuard): Promise<Response> {
  let env;
  try {
    env = parseEnv("highlevel");
  } catch (error) {
    return notConfigured(error);
  }
  return handleOAuthCallback(request, {
    client: buildClient(env),
    store: {
      saveAgencyConnection: (input) => saveAgencyConnection(input, env.TOKEN_ENCRYPTION_KEY),
      saveLocationConnection: (input) => saveLocationConnection(input, env.TOKEN_ENCRYPTION_KEY),
    },
    now: () => new Date(),
    stateSecret: env.TOKEN_ENCRYPTION_KEY,
    currentAdminId: guard?.adminId,
  });
}

// publicKeyPem is for tests only; production uses HighLevel's published key.
export function createWebhookRoute(options: { publicKeyPem?: string } = {}) {
  return (request: Request) => handleWebhookRequest(request, options.publicKeyPem);
}

export const webhookRoute = createWebhookRoute();

async function handleWebhookRequest(request: Request, publicKeyPem: string | undefined): Promise<Response> {
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
    reconcile: {
      listInstalledLocations: client.listInstalledLocations,
      readLocationCompanyId,
    },
  });
}
