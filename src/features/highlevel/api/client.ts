import type {
  AgencyLocation,
  AgencyToken,
  CustomValue,
  HighLevelClientConfig,
  InstalledLocation,
  LocationToken,
  OAuthCodeResult,
  RefreshedToken,
  SearchUsersQuery,
  HighLevelUser,
} from "../types";

// Endpoint facts: docs/greenlane/hl-api-notes.md. Every request sends a Version header.
const API_VERSION = "v3";
const CUSTOM_VALUES_API_VERSION = "2021-07-28"; // the custom values endpoints document this value
const PAGE_SIZE = 100; // documented maximum
const MAX_PAGES = 50; // guard against a paging loop
const USER_SEARCH_LIMIT = 25; // the docs' default page size; the invite check searches by exact email
const REQUEST_TIMEOUT_MS = 10_000; // a stalled HighLevel must not hold the route open
const MEDIA_UPLOAD_TIMEOUT_MS = 20_000; // a proposal: an image of at most 2 MB, not a measured time
const CONTACT_SEARCH_API_VERSION = API_VERSION; // the live docs name v3; older OpenAPI files say 2021-07-28 (not yet confirmed on a real response)

// Carries the HTTP status (null: no response) and nothing else: never a body, token or secret.
// `detail` holds the raw response text for the server log only (it is redacted and cut before it
// is written, see log-error.ts) and is never part of `message`.
export class HighLevelHttpError extends Error {
  readonly status: number | null;
  readonly detail: string | null;
  constructor(message: string, status: number | null, options: { body?: string } = {}) {
    super(message);
    this.name = "HighLevelHttpError";
    this.status = status;
    this.detail = options.body ?? null;
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
      let body: string | undefined;
      try {
        body = (await response.text()).slice(0, 2000);
      } catch {
        body = undefined;
      }
      throw new HighLevelHttpError(`HighLevel ${what} failed (status ${response.status}).`, response.status, { body });
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

  // The code exchange for the install flow. A bulk (agency) install answers userType "Company"; a
  // single sub-account install may answer a Location token. Only key names and the userType reach
  // the log, never values (no PII, no tokens).
  async function exchangeCode(code: string): Promise<OAuthCodeResult> {
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
    const userType = typeof json.userType === "string" ? json.userType : "";
    console.info(`HighLevel token exchange: userType=${userType || "none"} fields=${Object.keys(json).sort().join(",")}`);
    const expires = typeof json.expires_in === "string" && /^\d+$/.test(json.expires_in) ? Number(json.expires_in) : json.expires_in;
    if (!isNonEmptyString(json.access_token) || !isPositiveInteger(expires)) {
      throw new Error(`HighLevel ${what} returned an unexpected response (no usable access token or expiry).`);
    }
    const kind = userType.toLowerCase();
    if (kind === "company" || (kind === "" && isNonEmptyString(json.companyId) && !isNonEmptyString(json.locationId))) {
      if (!isNonEmptyString(json.companyId) || !isNonEmptyString(json.refresh_token)) {
        throw new Error(`HighLevel ${what} returned an unexpected response (Company token without companyId or refresh token).`);
      }
      return { kind: "company", accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSeconds: expires, companyId: json.companyId };
    }
    if (kind === "location" && isNonEmptyString(json.locationId)) {
      return {
        kind: "location",
        accessToken: json.access_token,
        refreshToken: isNonEmptyString(json.refresh_token) ? json.refresh_token : null,
        expiresInSeconds: expires,
        locationId: json.locationId,
        companyId: isNonEmptyString(json.companyId) ? json.companyId : null,
      };
    }
    throw new Error(`HighLevel ${what} returned an unexpected userType (${userType || "none"}).`);
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

  async function listInstalledLocationsV3(
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

  // HighLevel's OpenAPI file names /oauth/installedLocations (skip and limit, answer `locations`).
  async function listInstalledLocationsLegacy(agencyAccessToken: string, companyId: string): Promise<InstalledLocation[]> {
    const what = "installed locations";
    const found = new Map<string, InstalledLocation>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ companyId, appId: config.appId, isInstalled: "true", limit: String(PAGE_SIZE), skip: String(page * PAGE_SIZE) });
      const json = await requestJson(what, `/oauth/installedLocations?${query.toString()}`, {
        method: "GET",
        headers: { authorization: `Bearer ${agencyAccessToken}`, version: CUSTOM_VALUES_API_VERSION },
      });
      if (!Array.isArray(json.locations)) throw new Error(`HighLevel ${what} returned an unexpected response.`);
      for (const item of json.locations as Record<string, unknown>[]) {
        const id = typeof item === "object" && item !== null ? (isNonEmptyString(item._id) ? item._id : isNonEmptyString(item.id) ? item.id : null) : null;
        if (!id) throw new Error(`HighLevel ${what} returned an unexpected response.`);
        if (item.isInstalled === false) continue;
        if (!found.has(id)) found.set(id, { locationId: id, name: isNonEmptyString(item.name) ? item.name : null });
      }
      if (json.locations.length < PAGE_SIZE) return [...found.values()];
    }
    throw new Error(`HighLevel ${what} returned too many pages.`);
  }

  async function listInstalledLocations(agencyAccessToken: string, companyId: string): Promise<InstalledLocation[]> {
    try {
      return await listInstalledLocationsV3(agencyAccessToken, companyId);
    } catch (error) {
      if (error instanceof HighLevelHttpError && error.status === 404) return listInstalledLocationsLegacy(agencyAccessToken, companyId);
      throw error;
    }
  }

  // The `installToFutureLocations` flag of GET /oauth/installed-locations (public docs, read
  // 2026-11-24; not yet seen on a real answer). Null when HighLevel does not send a boolean, or the
  // v3 path is missing (404): the caller must then treat it as unknown.
  async function readInstallToFutureLocations(agencyAccessToken: string, companyId: string): Promise<boolean | null> {
    const query = new URLSearchParams({ companyId, appId: config.appId, pageSize: "1" });
    try {
      const json = await requestJson("installed locations", `/oauth/installed-locations?${query.toString()}`, {
        method: "GET",
        headers: { authorization: `Bearer ${agencyAccessToken}`, version: API_VERSION },
      });
      return typeof json.installToFutureLocations === "boolean" ? json.installToFutureLocations : null;
    } catch (error) {
      if (error instanceof HighLevelHttpError && error.status === 404) return null;
      throw error;
    }
  }

  // GET /locations/search (agency token, scope locations.readonly): every sub-account of the agency,
  // installed or not. OpenAPI file: query companyId, skip, limit (default 10).
  async function listAgencyLocations(agencyAccessToken: string, companyId: string): Promise<AgencyLocation[]> {
    const what = "location search";
    const found = new Map<string, AgencyLocation>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ companyId, limit: String(PAGE_SIZE), skip: String(page * PAGE_SIZE) });
      const json = await requestJson(what, `/locations/search?${query.toString()}`, {
        method: "GET",
        headers: { authorization: `Bearer ${agencyAccessToken}`, version: CUSTOM_VALUES_API_VERSION },
      });
      if (!Array.isArray(json.locations)) throw new Error(`HighLevel ${what} returned an unexpected response.`);
      for (const item of json.locations as Record<string, unknown>[]) {
        if (typeof item !== "object" || item === null || !isNonEmptyString(item.id)) continue;
        if (!found.has(item.id)) {
          found.set(item.id, {
            locationId: item.id,
            name: isNonEmptyString(item.name) ? item.name : null,
            email: isNonEmptyString(item.email) ? item.email : null,
          });
        }
      }
      if (json.locations.length < PAGE_SIZE) return [...found.values()];
    }
    throw new Error(`HighLevel ${what} returned too many pages.`);
  }

  // The users of one sub-account. `GET /users/?locationId=` (Location-Access, users.readonly) per the
  // OpenAPI file; if HighLevel answers 4xx for it, fall back to /users/search for that location.
  async function listLocationUsers(accessToken: string, companyId: string | null, locationId: string): Promise<HighLevelUser[]> {
    const what = "location users";
    const headers = { authorization: `Bearer ${accessToken}`, version: CUSTOM_VALUES_API_VERSION };
    let raw: unknown[];
    try {
      const json = await requestJson(what, `/users/?${new URLSearchParams({ locationId }).toString()}`, { method: "GET", headers });
      if (!Array.isArray(json.users)) throw new Error(`HighLevel ${what} returned an unexpected response.`);
      raw = json.users as unknown[];
    } catch (error) {
      if (!(error instanceof HighLevelHttpError) || error.status === null || error.status >= 500 || !companyId) throw error;
      raw = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const json = await requestJson(what, `/users/search?${new URLSearchParams({ companyId, locationId, limit: String(PAGE_SIZE), skip: String(page * PAGE_SIZE) }).toString()}`, {
          method: "GET",
          headers: { authorization: `Bearer ${accessToken}`, version: API_VERSION },
        });
        if (!Array.isArray(json.users)) throw new Error(`HighLevel ${what} returned an unexpected response.`);
        raw.push(...(json.users as unknown[]));
        if (json.users.length < PAGE_SIZE) break;
      }
    }
    return parseUsers(raw);
  }

  async function mintLocationToken(
    agencyAccessToken: string,
    companyId: string,
    locationId: string,
  ): Promise<LocationToken> {
    const what = "location token";
    const form = new URLSearchParams({ companyId, locationId }).toString();
    const call = (path: string, version: string) =>
      requestJson(what, path, {
        method: "POST",
        headers: { authorization: `Bearer ${agencyAccessToken}`, "content-type": "application/x-www-form-urlencoded", version },
        body: form,
      });
    // The v3 reference names /oauth/location-token; HighLevel's OpenAPI file names /oauth/locationToken
    // (hl-api-notes.md, discrepancy 1). Try the first, fall back on a 404.
    const json = await call("/oauth/location-token", API_VERSION).catch((error: unknown) => {
      if (error instanceof HighLevelHttpError && error.status === 404) return call("/oauth/locationToken", CUSTOM_VALUES_API_VERSION);
      throw error;
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

  // GET /users/search (scope users.readonly). Used by the invite check. The page lists agency and
  // sub-account tokens; not yet seen on a real response (docs/greenlane/hl-api-notes.md). Unknown
  // fields are ignored; an entry without a string id and email is dropped.
  async function searchUsers(accessToken: string, input: SearchUsersQuery): Promise<HighLevelUser[]> {
    const what = "user search";
    const query = new URLSearchParams({
      companyId: input.companyId,
      locationId: input.locationId,
      query: input.query,
      limit: String(USER_SEARCH_LIMIT),
    });
    const json = await requestJson(what, `/users/search?${query.toString()}`, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, version: API_VERSION },
    });
    if (!Array.isArray(json.users)) {
      throw new Error(`HighLevel ${what} returned an unexpected response.`);
    }
    return parseUsers(json.users as unknown[]);
  }

  // Unknown fields are ignored; an entry without a string id and email is dropped. The name falls
  // back to first and last name.
  function parseUsers(list: unknown[]): HighLevelUser[] {
    const users: HighLevelUser[] = [];
    const withoutEmail = new Set<string>();
    listedWithoutEmailByList.set(users, withoutEmail);
    for (const raw of list) {
      if (typeof raw !== "object" || raw === null) continue;
      const item = raw as Record<string, unknown>;
      if (isNonEmptyString(item.id) && !isNonEmptyString(item.email) && item.deleted !== true) withoutEmail.add(item.id);
      if (!isNonEmptyString(item.id) || !isNonEmptyString(item.email)) continue;
      const roles =
        typeof item.roles === "object" && item.roles !== null ? (item.roles as Record<string, unknown>) : {};
      const joined = [item.firstName, item.lastName].filter(isNonEmptyString).join(" ");
      users.push({
        id: item.id,
        email: item.email,
        name: isNonEmptyString(item.name) ? item.name : joined || null,
        deleted: item.deleted === true,
        roleType: isNonEmptyString(roles.type) ? roles.type : null,
        role: isNonEmptyString(roles.role) ? roles.role : null,
        locationIds: Array.isArray(roles.locationIds) ? roles.locationIds.filter(isNonEmptyString) : [],
      });
    }
    return users;
  }

  // GET /locations/{locationId}/customValues (scope locations/customValues.readonly). Taken from
  // HighLevel's OpenAPI file, not yet seen on a real response. This call documents Version
  // 2021-07-28 (the others use v3). fieldKey looks like "{{ custom_values.main_color }}"; the key
  // is the part after "custom_values.". Entries without a usable key or a string value are dropped.
  async function listCustomValues(accessToken: string, locationId: string): Promise<CustomValue[]> {
    const what = "custom values";
    const json = await requestJson(what, `/locations/${encodeURIComponent(locationId)}/customValues`, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, version: CUSTOM_VALUES_API_VERSION },
    });
    if (!Array.isArray(json.customValues)) {
      throw new Error(`HighLevel ${what} returned an unexpected response.`);
    }
    const values: CustomValue[] = [];
    for (const raw of json.customValues as unknown[]) {
      if (typeof raw !== "object" || raw === null) continue;
      const item = raw as Record<string, unknown>;
      if (typeof item.fieldKey !== "string" || typeof item.value !== "string") continue;
      const match = /^\{\{\s*custom_values\.([A-Za-z0-9_]+)\s*\}\}$/.exec(item.fieldKey.trim());
      if (match) values.push({ key: match[1], value: item.value });
    }
    return values;
  }

  // POST /contacts/search (scope contacts.readonly). A read despite the POST. One page, newest first.
  // Answers the raw Response so withLocationToken can refresh once on a 401; contacts.ts parses it.
  async function requestContactSearch(accessToken: string, locationId: string, pageLimit: number): Promise<Response> {
    try {
      return await doFetch(`${base}/contacts/search`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          version: CONTACT_SEARCH_API_VERSION,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ locationId, page: 1, pageLimit, sort: [{ field: "dateAdded", direction: "desc" }] }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel contact search could not reach HighLevel.", null);
    }
  }

  // GET /locations/{locationId}/customValues as a raw Response, so withLocationToken can refresh once
  // on a 401. custom-value-write.ts parses it, keeping each value's id and name for the update.
  async function requestCustomValues(accessToken: string, locationId: string): Promise<Response> {
    try {
      return await doFetch(`${base}/locations/${encodeURIComponent(locationId)}/customValues`, {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}`, version: CUSTOM_VALUES_API_VERSION, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel custom values could not be reached.", null);
    }
  }

  // PUT /locations/{locationId}/customValues/{id}. The body needs both name and value (OpenAPI file,
  // not yet seen on a real response). Only custom-value-write.ts calls it.
  async function requestUpdateCustomValue(accessToken: string, locationId: string, id: string, body: { name: string; value: string }): Promise<Response> {
    try {
      return await doFetch(`${base}/locations/${encodeURIComponent(locationId)}/customValues/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          version: CUSTOM_VALUES_API_VERSION,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ name: body.name, value: body.value }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel custom value update could not reach HighLevel.", null);
    }
  }

  // PUT /medias/delete-files with status `trashed`, for one file id. One attempt; only media-write.ts calls it.
  async function requestMediaTrash(accessToken: string, locationId: string, fileId: string): Promise<Response> {
    try {
      return await doFetch(`${base}/medias/delete-files`, {
        method: "PUT",
        headers: { authorization: `Bearer ${accessToken}`, version: API_VERSION, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ filesToBeDeleted: [{ _id: fileId }], altType: "location", altId: locationId, status: "trashed" }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel media trash could not reach HighLevel.", null);
    }
  }

  // GET /medias/files for one page of one folder (OpenAPI file, not yet seen on a real response). No
  // `parentId` means the top of the library. Only media-write.ts calls it.
  async function requestMediaFiles(accessToken: string, locationId: string, page: { type: "file" | "folder"; parentId: string | null; offset: number; limit: number }): Promise<Response> {
    const query = new URLSearchParams({ sortBy: "createdAt", sortOrder: "desc", type: page.type, altType: "location", altId: locationId, offset: String(page.offset), limit: String(page.limit) });
    if (page.parentId) query.set("parentId", page.parentId);
    try {
      return await doFetch(`${base}/medias/files?${query}`, {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}`, version: API_VERSION, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel media list could not be reached.", null);
    }
  }

  // POST /medias/upload-file. The location comes from the token. One attempt; only media-write.ts calls it.
  async function requestMediaUpload(accessToken: string, file: { bytes: Uint8Array; name: string; fileName: string; contentType: string; parentId?: string | null }): Promise<Response> {
    const body = new FormData();
    body.append("file", new Blob([file.bytes as BlobPart], { type: file.contentType }), file.fileName);
    body.append("name", file.name);
    if (file.parentId) body.append("parentId", file.parentId);
    try {
      return await doFetch(`${base}/medias/upload-file`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, version: API_VERSION, accept: "application/json" },
        body,
        signal: AbortSignal.timeout(MEDIA_UPLOAD_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel media upload could not reach HighLevel.", null);
    }
  }

  // POST /medias/folder with { altId, altType: "location", name, parentId } (OpenAPI medias.json and
  // medias-v3.json, CreateFolderParams). UNVERIFIED CONTRACT: no real response seen; the documented
  // answer has no folder id. One attempt; only media-write.ts calls it, for the template copy.
  async function requestMediaCreateFolder(accessToken: string, locationId: string, folder: { name: string; parentId: string | null }): Promise<Response> {
    const body: Record<string, string> = { altId: locationId, altType: "location", name: folder.name };
    if (folder.parentId) body.parentId = folder.parentId;
    try {
      return await doFetch(`${base}/medias/folder`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, version: API_VERSION, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel media folder could not reach HighLevel.", null);
    }
  }

  return { exchangeAgencyCode, exchangeCode, listAgencyLocations, listCustomValues, listLocationUsers, listInstalledLocations, mintLocationToken, readInstallToFutureLocations, refreshToken, requestContactSearch, requestCustomValues, requestMediaCreateFolder, requestMediaFiles, requestMediaTrash, requestMediaUpload, requestUpdateCustomValue, searchUsers };
}

// Ids of people a parsed user list named but dropped for having no email. They are still in
// HighLevel, so the user sync must not treat them as gone.
const listedWithoutEmailByList = new WeakMap<readonly HighLevelUser[], ReadonlySet<string>>();
createHighLevelClient.listedWithoutEmail = (users: readonly HighLevelUser[]): ReadonlySet<string> =>
  listedWithoutEmailByList.get(users) ?? new Set<string>();
