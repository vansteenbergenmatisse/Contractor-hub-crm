import { randomUUID } from "node:crypto";
import { parseEnv } from "@/shared/config";
import { createHighLevelClient } from "./client";
import { handleOAuthStart } from "./start";
import { handleOAuthCallback } from "./callback";
import { handleWebhook } from "./webhook";
import {
  deleteAgencyConnection,
  markLocationUninstalled,
  readAgencyAccessToken,
  saveAgencyConnection,
  saveLocationConnection,
} from "../db/connections";
import { beginWebhookEvent, markWebhookProcessed } from "../db/webhook-events";

// Wiring for the two OAuth routes in src/app. Env is read per request (lazy), so `next build`
// needs none. A missing or malformed env answers 500 with no detail; the names are logged.
function notConfigured(error: unknown): Response {
  console.error("HighLevel routes: ", error instanceof Error ? error.message : "invalid env");
  return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
}

// Admin sign-in arrives with Better Auth (ticket 6). Until then nobody is an admin, so /start
// is closed. Replace this guard in ticket 6; do not widen it before.
const noAdminYet = async () => false;

export async function oauthStartRoute(request: Request): Promise<Response> {
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
    isAdmin: noAdminYet,
    stateSecret: env.TOKEN_ENCRYPTION_KEY,
  });
}

export async function oauthCallbackRoute(request: Request): Promise<Response> {
  let env;
  try {
    env = parseEnv("highlevel");
  } catch (error) {
    return notConfigured(error);
  }
  return handleOAuthCallback(request, {
    client: createHighLevelClient({
      baseUrl: env.GHL_API_BASE_URL,
      appId: env.GHL_APP_ID,
      clientId: env.GHL_CLIENT_ID,
      clientSecret: env.GHL_CLIENT_SECRET,
      redirectUri: env.GHL_REDIRECT_URI,
    }),
    store: {
      saveAgencyConnection: (input) => saveAgencyConnection(input, env.TOKEN_ENCRYPTION_KEY),
      saveLocationConnection: (input) => saveLocationConnection(input, env.TOKEN_ENCRYPTION_KEY),
    },
    now: () => new Date(),
    stateSecret: env.TOKEN_ENCRYPTION_KEY,
  });
}

export async function webhookRoute(request: Request): Promise<Response> {
  let env;
  try {
    env = parseEnv("highlevel");
  } catch (error) {
    return notConfigured(error);
  }
  return handleWebhook(request, {
    appId: env.GHL_APP_ID,
    now: () => new Date(),
    newId: () => randomUUID(),
    store: {
      begin: beginWebhookEvent,
      markProcessed: markWebhookProcessed,
      readAgencyAccessToken: (companyId, now) => readAgencyAccessToken(companyId, env.TOKEN_ENCRYPTION_KEY, now),
      saveLocationConnection: (input) => saveLocationConnection(input, env.TOKEN_ENCRYPTION_KEY),
      markLocationUninstalled,
      deleteAgencyConnection,
    },
    client: createHighLevelClient({
      baseUrl: env.GHL_API_BASE_URL,
      appId: env.GHL_APP_ID,
      clientId: env.GHL_CLIENT_ID,
      clientSecret: env.GHL_CLIENT_SECRET,
      redirectUri: env.GHL_REDIRECT_URI,
    }),
  });
}
