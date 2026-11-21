import { describe, expect, it, vi } from "vitest";
import { createHighLevelClient } from "@/features/highlevel";

// Fixtures follow docs/greenlane/hl-api-notes.md (POST /oauth/token response). Values are fake.
const agencyTokenResponse = {
  access_token: "agency-access-1",
  token_type: "Bearer",
  expires_in: 86399,
  refresh_token: "agency-refresh-1",
  scope: "oauth.readonly oauth.write",
  userType: "Company",
  companyId: "company_1",
  userId: "user_1",
  isBulkInstallation: true,
};

// "v3" follows the reference pages in hl-api-notes.md. The guide pages show 2021-07-28 for the
// location token (discrepancy 2 there); confirm on staging, read-only, before relying on it.
const config = {
  baseUrl: "https://hl.example.test",
  appId: "app-id-1",
  clientId: "client-id-1",
  clientSecret: "client-secret-1",
  redirectUri: "https://app.example.test/api/integrations/oauth/callback",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("HighLevel client: exchangeAgencyCode", () => {
  it("posts a form-encoded Company code exchange and returns the agency token", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(agencyTokenResponse));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });

    const token = await client.exchangeAgencyCode("code-1");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hl.example.test/oauth/token");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(headers.get("version")).toBe("v3");
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      client_id: "client-id-1",
      client_secret: "client-secret-1",
      grant_type: "authorization_code",
      code: "code-1",
      user_type: "Company",
      redirect_uri: config.redirectUri,
    });
    expect(token).toEqual({
      accessToken: "agency-access-1",
      refreshToken: "agency-refresh-1",
      expiresInSeconds: 86399,
      companyId: "company_1",
    });
  });
});

describe("HighLevel client: exchangeAgencyCode failures", () => {
  async function failure(response: Response | Error): Promise<Error> {
    const fetchFn = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    const client = createHighLevelClient({ ...config, fetch: fetchFn });
    return client.exchangeAgencyCode("code-1").then(
      () => {
        throw new Error("expected rejection");
      },
      (error: Error) => error,
    );
  }

  it("rejects a non-2xx response without echoing the body", async () => {
    const error = await failure(jsonResponse({ error: "invalid_grant", leaked: "agency-access-1" }, 400));
    expect(error.message).toBe("HighLevel token exchange failed (status 400).");
  });

  it("rejects a body that is not JSON", async () => {
    const error = await failure(new Response("<html>oops</html>", { status: 200 }));
    expect(error.message).toBe("HighLevel token exchange returned an unreadable response.");
  });

  it.each([
    ["wrong userType", { ...agencyTokenResponse, userType: "Location" }],
    ["missing companyId", { ...agencyTokenResponse, companyId: undefined }],
    ["missing access_token", { ...agencyTokenResponse, access_token: undefined }],
    ["empty refresh_token", { ...agencyTokenResponse, refresh_token: "" }],
    ["string expires_in", { ...agencyTokenResponse, expires_in: "86399" }],
    ["zero expires_in", { ...agencyTokenResponse, expires_in: 0 }],
    ["negative expires_in", { ...agencyTokenResponse, expires_in: -5 }],
    ["fractional expires_in", { ...agencyTokenResponse, expires_in: 1.5 }],
  ])("rejects a 200 response with %s", async (_label, body) => {
    const error = await failure(jsonResponse(body));
    expect(error.message).toBe("HighLevel token exchange returned an unexpected response.");
  });

  it("rejects a JSON body that is not an object", async () => {
    const error = await failure(jsonResponse(null));
    expect(error.message).toBe("HighLevel token exchange returned an unexpected response.");
  });

  it("wraps a network error without leaking the client secret", async () => {
    const error = await failure(new Error("connect failed for client-secret-1"));
    expect(error.message).toBe("HighLevel token exchange could not reach HighLevel.");
    expect(error.message).not.toContain("client-secret-1");
  });
});

// Fixture shape follows GET /oauth/installed-locations in hl-api-notes.md. Values are fake.
function locationsPage(ids: string[], next?: string, extra: Record<string, unknown>[] = []) {
  return {
    items: [
      ...ids.map((id) => ({ _id: id, name: `Name ${id}`, isInstalled: true, installedAt: "2026-11-01" })),
      ...extra,
    ],
    pagination: next ? { hasNextPage: true, nextPageToken: next } : { hasNextPage: false },
  };
}

describe("HighLevel client: listInstalledLocations", () => {
  it("asks for installed locations of the company and app with the agency token", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(locationsPage(["loc_1"])));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });

    const locations = await client.listInstalledLocations("agency-access-1", "company_1");

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://hl.example.test/oauth/installed-locations");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      companyId: "company_1",
      appId: "app-id-1",
      isInstalled: "true",
      pageSize: "100",
    });
    expect(init.method).toBe("GET");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer agency-access-1");
    expect(headers.get("version")).toBe("v3");
    expect(locations).toEqual([{ locationId: "loc_1", name: "Name loc_1" }]);
  });

  it("follows pageToken until there is no next page", async () => {
    const pages = [locationsPage(["loc_1", "loc_2"], "tok_2"), locationsPage(["loc_3"])];
    const fetchFn = vi.fn(async () => jsonResponse(pages.shift()));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });

    const locations = await client.listInstalledLocations("a", "company_1");

    expect(locations.map((l) => l.locationId)).toEqual(["loc_1", "loc_2", "loc_3"]);
    const second = new URL((fetchFn.mock.calls[1] as unknown as [string])[0]);
    expect(second.searchParams.get("pageToken")).toBe("tok_2");
  });

  it("skips items that are not installed and de-duplicates ids", async () => {
    const page = locationsPage(["loc_1", "loc_1"], undefined, [
      { _id: "loc_9", name: "Gone", isInstalled: false },
    ]);
    const client = createHighLevelClient({ ...config, fetch: async () => jsonResponse(page) });
    expect((await client.listInstalledLocations("a", "c")).map((l) => l.locationId)).toEqual(["loc_1"]);
  });

  it("keeps a location whose name is missing, with a null name", async () => {
    const page = { items: [{ _id: "loc_1", isInstalled: true }], pagination: { hasNextPage: false } };
    const client = createHighLevelClient({ ...config, fetch: async () => jsonResponse(page) });
    expect(await client.listInstalledLocations("a", "c")).toEqual([{ locationId: "loc_1", name: null }]);
  });

  it("stops with an error if paging never ends", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(locationsPage(["loc_1"], "again")));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });
    await expect(client.listInstalledLocations("a", "c")).rejects.toThrow(
      "HighLevel installed locations returned too many pages.",
    );
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(50);
  });

  it.each([
    ["items is not an array", { items: "x", pagination: { hasNextPage: false } }],
    ["an item has no _id", { items: [{ name: "x", isInstalled: true }], pagination: { hasNextPage: false } }],
    ["hasNextPage without a token", { items: [], pagination: { hasNextPage: true } }],
    ["pagination missing", { items: [] }],
  ])("rejects a response where %s", async (_label, body) => {
    const client = createHighLevelClient({ ...config, fetch: async () => jsonResponse(body) });
    await expect(client.listInstalledLocations("a", "c")).rejects.toThrow(
      "HighLevel installed locations returned an unexpected response.",
    );
  });

  it("reports a non-2xx status without the body", async () => {
    const client = createHighLevelClient({
      ...config,
      fetch: async () => jsonResponse({ message: "agency-access-1" }, 401),
    });
    await expect(client.listInstalledLocations("agency-access-1", "c")).rejects.toThrow(
      "HighLevel installed locations failed (status 401).",
    );
  });
});

// Fixture shape follows POST /oauth/location-token in hl-api-notes.md. Values are fake.
const locationTokenResponse = {
  access_token: "loc-access-1",
  token_type: "Bearer",
  expires_in: 86400,
  scope: "contacts.readonly",
  locationId: "loc_1",
  userId: "user_1",
  appId: "app-id-1",
  versionId: "v1",
  refresh_token: "loc-refresh-1",
};

describe("HighLevel client: mintLocationToken", () => {
  it("posts companyId and locationId with the agency token and returns the location token", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(locationTokenResponse));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });

    const token = await client.mintLocationToken("agency-access-1", "company_1", "loc_1");

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hl.example.test/oauth/location-token");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer agency-access-1");
    expect(headers.get("version")).toBe("v3");
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      companyId: "company_1",
      locationId: "loc_1",
    });
    expect(token).toEqual({
      accessToken: "loc-access-1",
      refreshToken: "loc-refresh-1",
      expiresInSeconds: 86400,
      locationId: "loc_1",
    });
  });

  it("returns a null refresh token when the response has none", async () => {
    const body = { ...locationTokenResponse, refresh_token: undefined };
    const client = createHighLevelClient({ ...config, fetch: async () => jsonResponse(body) });
    expect((await client.mintLocationToken("a", "c", "loc_1")).refreshToken).toBeNull();
  });

  it.each([
    ["a different locationId", { ...locationTokenResponse, locationId: "loc_2" }],
    ["no locationId", { ...locationTokenResponse, locationId: undefined }],
    ["no access_token", { ...locationTokenResponse, access_token: undefined }],
    ["a bad expires_in", { ...locationTokenResponse, expires_in: "soon" }],
    ["an empty refresh_token", { ...locationTokenResponse, refresh_token: "" }],
  ])("rejects a response with %s", async (_label, body) => {
    const client = createHighLevelClient({ ...config, fetch: async () => jsonResponse(body) });
    await expect(client.mintLocationToken("a", "c", "loc_1")).rejects.toThrow(
      "HighLevel location token returned an unexpected response.",
    );
  });

  it("reports a non-2xx status without the body", async () => {
    const client = createHighLevelClient({
      ...config,
      fetch: async () => jsonResponse({ message: "agency-access-1" }, 403),
    });
    await expect(client.mintLocationToken("agency-access-1", "c", "loc_1")).rejects.toThrow(
      "HighLevel location token failed (status 403).",
    );
  });
});

describe("HighLevel client: request hygiene", () => {
  it("normalizes a trailing slash on the base URL", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(agencyTokenResponse));
    const client = createHighLevelClient({ ...config, baseUrl: "https://hl.example.test///", fetch: fetchFn });
    await client.exchangeAgencyCode("c");
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe("https://hl.example.test/oauth/token");
  });

  it("gives every request an abort signal so a stalled HighLevel cannot hang the route", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      jsonResponse(
        url.includes("installed-locations")
          ? locationsPage(["loc_1"])
          : url.includes("location-token")
            ? locationTokenResponse
            : agencyTokenResponse,
      ),
    );
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const client = createHighLevelClient({ ...config, fetch: fetchFn as unknown as typeof fetch });
    await client.exchangeAgencyCode("c");
    await client.listInstalledLocations("a", "c");
    await client.mintLocationToken("a", "c", "loc_1");
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(timeoutSpy).toHaveBeenCalledTimes(3);
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    timeoutSpy.mockRestore();
    for (const call of fetchFn.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("reports a timeout as an unreachable HighLevel", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const client = createHighLevelClient({ ...config, fetch: async () => Promise.reject(timeout) });
    await expect(client.exchangeAgencyCode("c")).rejects.toThrow(
      "HighLevel token exchange could not reach HighLevel.",
    );
  });

  it("keeps a pageToken with & and = intact in the query", async () => {
    const pages = [locationsPage(["loc_1"], "a&b=c d"), locationsPage(["loc_2"])];
    const fetchFn = vi.fn(async () => jsonResponse(pages.shift()));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });
    await client.listInstalledLocations("a", "c");
    const second = new URL((fetchFn.mock.calls[1] as unknown as [string])[0]);
    expect(second.searchParams.get("pageToken")).toBe("a&b=c d");
    expect(second.searchParams.get("companyId")).toBe("c");
  });

  it("encodes special characters in the mint form body", async () => {
    const body = { ...locationTokenResponse, locationId: "loc&x=1" };
    const fetchFn = vi.fn(async () => jsonResponse(body));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });
    await client.mintLocationToken("a", "co&mp=1", "loc&x=1");
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      companyId: "co&mp=1",
      locationId: "loc&x=1",
    });
  });

  it("rejects a null item in the locations list", async () => {
    const page = { items: [null], pagination: { hasNextPage: false } };
    const client = createHighLevelClient({ ...config, fetch: async () => jsonResponse(page) });
    await expect(client.listInstalledLocations("a", "c")).rejects.toThrow(
      "HighLevel installed locations returned an unexpected response.",
    );
  });
});
