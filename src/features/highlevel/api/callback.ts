import { timingSafeEqual } from "node:crypto";
import { STATE_COOKIE, clearStateCookie, isValidState } from "./oauth-state";
import { logError } from "./log-error";
import type {
  AgencyToken,
  InstalledLocation,
  LocationToken,
  OAuthCodeResult,
  SaveAgencyConnectionInput,
  SaveLocationConnectionInput,
} from "../types";

export type OAuthCallbackDeps = {
  client: {
    exchangeAgencyCode(code: string): Promise<AgencyToken>;
    listInstalledLocations(agencyAccessToken: string, companyId: string): Promise<InstalledLocation[]>;
    mintLocationToken(agencyAccessToken: string, companyId: string, locationId: string): Promise<LocationToken>;
  };
  // When present it is used instead of client.exchangeAgencyCode: it also accepts a Location token
  // (a single sub-account install).
  exchangeCode?(code: string): Promise<OAuthCodeResult>;
  store: {
    saveAgencyConnection(input: SaveAgencyConnectionInput): Promise<void>;
    saveLocationConnection(input: SaveLocationConnectionInput): Promise<{ tenantId: string }>;
  };
  now: () => Date;
  // The onboarding sync (tenants, location tokens and CRM users). Without it the callback mints and
  // saves a token per location itself and creates no users. The counts feed the response and the log.
  onboard?: {
    agencyLocations(input: { companyId: string; locations: InstalledLocation[] }): Promise<{ installed: number; failed: number }>;
    singleLocation(input: { companyId: string | null; locationId: string; accessToken: string; refreshToken: string | null; expiresAt: Date }): Promise<{ installed: number; failed: number }>;
  };
  // Same secret /start signs with.
  stateSecret: string;
  // The admin user id of the current session. When given, a state must be bound to exactly this id
  // and no session means 403; when absent, only an unbound state is accepted (fails closed).
  currentAdminId?: (request: Request) => Promise<string | null>;
};

const NO_STORE = { "cache-control": "no-store" };

// Exactly one cookie with this name, or null. Two of them (cookie tossing) are refused.
function readCookie(request: Request, name: string): string | null {
  const values: string[] = [];
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) values.push(part.slice(index + 1).trim());
  }
  return values.length === 1 ? values[0] : null;
}

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Responses never carry a token, the code or an upstream error message. The server log gets the
// step, the error name, the redacted message and stack, and for a HighLevel call the status and the
// redacted response body (see log-error.ts).
function fail(status: number, clearCookie: boolean, step?: string, error?: unknown): Response {
  if (error !== undefined) logError(`HighLevel install failed (${step ?? "unknown step"})`, error);
  const headers = new Headers(NO_STORE);
  if (clearCookie) headers.set("set-cookie", clearStateCookie());
  return new Response(null, { status, headers });
}

export async function handleOAuthCallback(request: Request, deps: OAuthCallbackDeps): Promise<Response> {
  const params = new URL(request.url).searchParams;
  let adminId: string | undefined;
  if (deps.currentAdminId) {
    let id: string | null = null;
    try {
      id = await deps.currentAdminId(request);
    } catch {
      id = null;
    }
    if (typeof id !== "string" || id.length === 0) {
      return new Response("Forbidden", { status: 403, headers: new Headers(NO_STORE) });
    }
    adminId = id;
  }
  const state = params.get("state");
  const cookieState = readCookie(request, STATE_COOKIE);
  // The state must be one this server signed and not expired, and it must be the one in this
  // browser's cookie. A failure leaves the cookie alone, so a forged link cannot cancel a real install.
  if (
    !state ||
    !cookieState ||
    !isValidState(state, deps.stateSecret, deps.now(), adminId) ||
    !sameState(state, cookieState)
  ) {
    return fail(400, false);
  }

  // From here the state is spent: every answer clears the cookie.
  const code = params.get("code");
  if (params.get("error") || !code) return fail(400, true);

  let agency: AgencyToken;
  try {
    if (deps.exchangeCode) {
      const result = await deps.exchangeCode(code);
      if (result.kind === "location") {
        // A single sub-account install: no agency token to list or mint with. Save this token and
        // onboard that one location.
        if (!deps.onboard) return fail(502, true, "location token without onboarding", new Error("No onboarding configured."));
        let counts: { installed: number; failed: number };
        try {
          counts = await deps.onboard.singleLocation({
            companyId: result.companyId,
            locationId: result.locationId,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: new Date(deps.now().getTime() + result.expiresInSeconds * 1000),
          });
        } catch (error) {
          return fail(502, true, "onboard single location", error);
        }
        console.info(`HighLevel install: location token, installed=${counts.installed} failed=${counts.failed}`);
        const headers = new Headers(NO_STORE);
        headers.set("set-cookie", clearStateCookie());
        return Response.json(counts, { status: counts.installed === 0 && counts.failed > 0 ? 502 : 200, headers });
      }
      agency = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresInSeconds: result.expiresInSeconds,
        companyId: result.companyId,
      };
    } else {
      agency = await deps.client.exchangeAgencyCode(code);
    }
  } catch (error) {
    return fail(502, true, "token exchange", error);
  }
  try {
    await deps.store.saveAgencyConnection({
      companyId: agency.companyId,
      accessToken: agency.accessToken,
      refreshToken: agency.refreshToken,
      expiresAt: new Date(deps.now().getTime() + agency.expiresInSeconds * 1000),
    });
  } catch (error) {
    return fail(502, true, "save agency connection", error);
  }

  let locations: InstalledLocation[];
  try {
    locations = await deps.client.listInstalledLocations(agency.accessToken, agency.companyId);
  } catch (error) {
    return fail(502, true, "list installed locations", error);
  }

  if (deps.onboard) {
    let counts: { installed: number; failed: number };
    try {
      counts = await deps.onboard.agencyLocations({ companyId: agency.companyId, locations });
    } catch (error) {
      return fail(502, true, "onboarding sync", error);
    }
    console.info(`HighLevel install: company token, locations=${locations.length} installed=${counts.installed} failed=${counts.failed}`);
    const headers = new Headers(NO_STORE);
    headers.set("set-cookie", clearStateCookie());
    return Response.json(counts, { status: counts.installed === 0 && counts.failed > 0 ? 502 : 200, headers });
  }

  // One at a time: stays far below the rate limit and keeps the failure count simple.
  let installed = 0;
  let failed = 0;
  for (const location of locations) {
    try {
      const token = await deps.client.mintLocationToken(
        agency.accessToken,
        agency.companyId,
        location.locationId,
      );
      await deps.store.saveLocationConnection({
        locationId: location.locationId,
        companyId: agency.companyId,
        name: location.name,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: new Date(deps.now().getTime() + token.expiresInSeconds * 1000),
      });
      installed += 1;
    } catch (error) {
      failed += 1;
      logError("HighLevel install failed for one location (mint or save)", error);
    }
  }

  const status = installed === 0 && failed > 0 ? 502 : 200;
  const headers = new Headers(NO_STORE);
  headers.set("set-cookie", clearStateCookie());
  return Response.json({ installed, failed }, { status, headers });
}
