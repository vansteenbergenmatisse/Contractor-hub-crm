import type {
  AgencyToken,
  HighLevelClientConfig,
  InstalledLocation,
  LocationToken,
  RefreshedToken,
} from "../types";

// Endpoint facts: docs/greenlane/hl-api-notes.md. Every request sends a Version header.
const API_VERSION = "v3";
const PAGE_SIZE = 100; // documented maximum
const MAX_PAGES = 50; // guard against a paging loop
const REQUEST_TIMEOUT_MS = 10_000; // a stalled HighLevel must not hold the route open

// Carries the HTTP status (null: no response) and nothing else: never a body, token or secret.
export class HighLevelHttpError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "HighLevelHttpError";
    this.status = status;
  }
}

// HighLevel answered and said no (a 4xx). 408 and 429 are "try later", not a verdict. The error
// bodies of the token endpoints are undocumented (docs/greenlane/hl-api-notes.md), so the status
// is all there is to go on.
export function isRejectedByHighLevel(error: unknown): boolean {
  return (
    error instanceof HighLevelHttpError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

export function createHighLevelClient(config: HighLevelClientConfig) {
  const doFetch = config.fetch ?? fetch;
  const base = config.baseUrl.replace(/\/+$/, "");

  // One request, one JSON object back. Error messages carry the operation name and the status
  // only: never a response body, a token, or the client secret.
  async function requestJson(
    what: string,
    path: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new HighLevelHttpError(`HighLevel ${what} could not reach HighLevel.`, null);
    }
    if (!response.ok) {
      throw new HighLevelHttpError(`HighLevel ${what} failed (status ${response.status}).`, response.status);
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error(`HighLevel ${what} returned an unreadable response.`);
    }
    if (typeof json !== "object" || json === null || Array.isArray(json)) {
      throw new Error(`HighLevel ${what} returned an unexpected response.`);
    }
    return json as Record<string, unknown>;
  }

  async function exchangeAgencyCode(code: string): Promise<AgencyToken> {
    const what = "token exchange";
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      user_type: "Company",
      redirect_uri: config.redirectUri,
    });
    const json = await requestJson(what, "/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", version: API_VERSION },
      body: body.toString(),
    });
    if (
      json.userType !== "Company" ||
      !isNonEmptyString(json.companyId) ||
      !isNonEmptyString(json.access_token) ||
      !isNonEmptyString(json.refresh_token) ||
      !isPositiveInteger(json.expires_in)
    ) {
      throw new Error(`HighLevel ${what} returned an unexpected response.`);
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresInSeconds: json.expires_in,
      companyId: json.companyId,
    };
  }

  // Every refresh may return a new refresh token and kills the old one (build prompt section 4.2):
  // the caller must store the pair it gets back before doing anything else.
  async function refreshToken(
    refreshTokenValue: string,
    userType: "Company" | "Location",
  ): Promise<RefreshedToken> {
    const what = "token refresh";
    const json = await requestJson(what, "/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", version: API_VERSION },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshTokenValue,
        user_type: userType,
      }).toString(),
    });
    const hasRefresh = json.refresh_token !== undefined;
    if (
      !isNonEmptyString(json.access_token) ||
      !isPositiveInteger(json.expires_in) ||
      (hasRefresh && !isNonEmptyString(json.refresh_token))
    ) {
      throw new Error(`HighLevel ${what} returned an unexpected response.`);
    }
    return {
      accessToken: json.access_token,
      refreshToken: hasRefresh ? (json.refresh_token as string) : null,
      expiresInSeconds: json.expires_in,
    };
  }

  async function listInstalledLocations(
    agencyAccessToken: string,
    companyId: string,
  ): Promise<InstalledLocation[]> {
    const what = "installed locations";
    const unexpected = () => new Error(`HighLevel ${what} returned an unexpected response.`);
    const found = new Map<string, InstalledLocation>();
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        companyId,
        appId: config.appId,
        isInstalled: "true",
        pageSize: String(PAGE_SIZE),
      });
      if (pageToken) query.set("pageToken", pageToken);
      const json = await requestJson(what, `/oauth/installed-locations?${query.toString()}`, {
        method: "GET",
        headers: { authorization: `Bearer ${agencyAccessToken}`, version: API_VERSION },
      });
      const { items, pagination } = json;
      if (!Array.isArray(items) || typeof pagination !== "object" || pagination === null) {
        throw unexpected();
      }
      for (const item of items as Record<string, unknown>[]) {
        if (typeof item !== "object" || item === null || !isNonEmptyString(item._id)) throw unexpected();
        if (item.isInstalled === false) continue;
        if (!found.has(item._id)) {
          found.set(item._id, {
            locationId: item._id,
            name: isNonEmptyString(item.name) ? item.name : null,
          });
        }
      }
      const { hasNextPage, nextPageToken } = pagination as Record<string, unknown>;
      if (hasNextPage !== true) return [...found.values()];
      if (!isNonEmptyString(nextPageToken)) throw unexpected();
      pageToken = nextPageToken;
    }
    throw new Error(`HighLevel ${what} returned too many pages.`);
  }

  async function mintLocationToken(
    agencyAccessToken: string,
    companyId: string,
    locationId: string,
  ): Promise<LocationToken> {
    const what = "location token";
    const json = await requestJson(what, "/oauth/location-token", {
      method: "POST",
      headers: {
        authorization: `Bearer ${agencyAccessToken}`,
        "content-type": "application/x-www-form-urlencoded",
        version: API_VERSION,
      },
      body: new URLSearchParams({ companyId, locationId }).toString(),
    });
    const hasRefresh = json.refresh_token !== undefined;
    if (
      json.locationId !== locationId ||
      !isNonEmptyString(json.access_token) ||
      !isPositiveInteger(json.expires_in) ||
      (hasRefresh && !isNonEmptyString(json.refresh_token))
    ) {
      throw new Error(`HighLevel ${what} returned an unexpected response.`);
    }
    return {
      accessToken: json.access_token,
      refreshToken: hasRefresh ? (json.refresh_token as string) : null,
      expiresInSeconds: json.expires_in,
      locationId,
    };
  }

  return { exchangeAgencyCode, listInstalledLocations, mintLocationToken, refreshToken };
}
