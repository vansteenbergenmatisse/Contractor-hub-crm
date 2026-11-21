import { timingSafeEqual } from "node:crypto";
import { STATE_COOKIE, clearStateCookie, isValidState } from "./oauth-state";
import type {
  AgencyToken,
  InstalledLocation,
  LocationToken,
  SaveAgencyConnectionInput,
  SaveLocationConnectionInput,
} from "../types";

export type OAuthCallbackDeps = {
  client: {
    exchangeAgencyCode(code: string): Promise<AgencyToken>;
    listInstalledLocations(agencyAccessToken: string, companyId: string): Promise<InstalledLocation[]>;
    mintLocationToken(agencyAccessToken: string, companyId: string, locationId: string): Promise<LocationToken>;
  };
  store: {
    saveAgencyConnection(input: SaveAgencyConnectionInput): Promise<void>;
    saveLocationConnection(input: SaveLocationConnectionInput): Promise<{ tenantId: string }>;
  };
  now: () => Date;
  // Same secret /start signs with.
  stateSecret: string;
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

// Responses never carry a token, the code or an upstream error message; failures are logged by
// type only (an upstream or database message could hold values).
function fail(status: number, clearCookie: boolean, error?: unknown): Response {
  if (error !== undefined) {
    console.error("HighLevel install failed:", error instanceof Error ? error.name : "unknown error");
  }
  const headers = new Headers(NO_STORE);
  if (clearCookie) headers.set("set-cookie", clearStateCookie());
  return new Response(null, { status, headers });
}

export async function handleOAuthCallback(request: Request, deps: OAuthCallbackDeps): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const cookieState = readCookie(request, STATE_COOKIE);
  // The state must be one this server signed and not expired, and it must be the one in this
  // browser's cookie. A failure leaves the cookie alone, so a forged link cannot cancel a real install.
  if (
    !state ||
    !cookieState ||
    !isValidState(state, deps.stateSecret, deps.now()) ||
    !sameState(state, cookieState)
  ) {
    return fail(400, false);
  }

  // From here the state is spent: every answer clears the cookie.
  const code = params.get("code");
  if (params.get("error") || !code) return fail(400, true);

  let agency: AgencyToken;
  try {
    agency = await deps.client.exchangeAgencyCode(code);
    await deps.store.saveAgencyConnection({
      companyId: agency.companyId,
      accessToken: agency.accessToken,
      refreshToken: agency.refreshToken,
      expiresAt: new Date(deps.now().getTime() + agency.expiresInSeconds * 1000),
    });
  } catch (error) {
    return fail(502, true, error);
  }

  let locations: InstalledLocation[];
  try {
    locations = await deps.client.listInstalledLocations(agency.accessToken, agency.companyId);
  } catch (error) {
    return fail(502, true, error);
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
      console.error("HighLevel install failed for one location:", error instanceof Error ? error.name : "unknown error");
    }
  }

  const status = installed === 0 && failed > 0 ? 502 : 200;
  const headers = new Headers(NO_STORE);
  headers.set("set-cookie", clearStateCookie());
  return Response.json({ installed, failed }, { status, headers });
}
