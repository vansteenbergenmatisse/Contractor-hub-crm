import { describe, expect, it, vi } from "vitest";
import { createHighLevelClient, HighLevelHttpError, isRejectedByHighLevel } from "@/features/highlevel";

// Shapes follow docs/greenlane/hl-api-notes.md (POST /oauth/token). Values are fake.
// Error bodies of the token endpoint are NOT documented there, so "rejected" is any 4xx but 429.
const config = {
  baseUrl: "https://hl.example.test",
  appId: "app-id-1",
  clientId: "client-id-1",
  clientSecret: "client-secret-1",
  redirectUri: "https://app.example.test/api/integrations/oauth/callback",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const refreshed = {
  access_token: "new-access",
  token_type: "Bearer",
  expires_in: 86399,
  refresh_token: "new-refresh",
  userType: "Location",
  locationId: "loc_1",
};

describe("HighLevel client: refreshToken", () => {
  it("posts a form-encoded refresh_token grant with the user type and returns the new pair", async () => {
    const fetchFn = vi.fn(async () => json(refreshed));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });

    const token = await client.refreshToken("old-refresh", "Location");

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hl.example.test/oauth/token");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(headers.get("version")).toBe("v3");
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      client_id: "client-id-1",
      client_secret: "client-secret-1",
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
      user_type: "Location",
    });
    expect(token).toEqual({ accessToken: "new-access", refreshToken: "new-refresh", expiresInSeconds: 86399 });
  });

  it("sends user_type Company for an agency refresh", async () => {
    const fetchFn = vi.fn(async () => json({ ...refreshed, userType: "Company" }));
    await createHighLevelClient({ ...config, fetch: fetchFn }).refreshToken("r", "Company");
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URLSearchParams(init.body as string).get("user_type")).toBe("Company");
  });

  it("returns a null refresh token when HighLevel sends none", async () => {
    const withoutRefresh: Record<string, unknown> = { ...refreshed };
    delete withoutRefresh.refresh_token;
    const client = createHighLevelClient({ ...config, fetch: async () => json(withoutRefresh) });
    expect((await client.refreshToken("r", "Location")).refreshToken).toBeNull();
  });

  it.each([
    ["no access_token", { ...refreshed, access_token: undefined }],
    ["an empty access_token", { ...refreshed, access_token: "" }],
    ["a non-integer expires_in", { ...refreshed, expires_in: "soon" }],
    ["a zero expires_in", { ...refreshed, expires_in: 0 }],
    ["an empty refresh_token", { ...refreshed, refresh_token: "" }],
  ])("rejects a 200 with %s", async (_label, body) => {
    const client = createHighLevelClient({ ...config, fetch: async () => json(body) });
    await expect(client.refreshToken("r", "Location")).rejects.toThrow("unexpected response");
  });

  it("never puts a token, the secret or the response body in an error", async () => {
    const client = createHighLevelClient({
      ...config,
      fetch: async () => json({ error: "invalid_grant", detail: "refresh-secret-value" }, 400),
    });
    const error = await client.refreshToken("refresh-secret-value", "Location").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HighLevelHttpError);
    const text = String((error as Error).message);
    expect(text).not.toContain("refresh-secret-value");
    expect(text).not.toContain("client-secret-1");
    expect(text).toContain("400");
  });
});

describe("HighLevel client: errors carry the status", () => {
  it("exposes the HTTP status and classifies rejected versus transient", async () => {
    const statusOf = async (response: Response | Error) => {
      const client = createHighLevelClient({
        ...config,
        fetch: async () => {
          if (response instanceof Error) throw response;
          return response;
        },
      });
      return client.refreshToken("r", "Location").catch((e: unknown) => e);
    };
    const bad = await statusOf(json({}, 400));
    expect((bad as HighLevelHttpError).status).toBe(400);
    expect(isRejectedByHighLevel(bad)).toBe(true);
    expect(isRejectedByHighLevel(await statusOf(json({}, 401)))).toBe(true);
    expect(isRejectedByHighLevel(await statusOf(json({}, 403)))).toBe(true);
    expect(isRejectedByHighLevel(await statusOf(json({}, 429)))).toBe(false);
    expect(isRejectedByHighLevel(await statusOf(json({}, 408)))).toBe(false);
    expect(isRejectedByHighLevel(await statusOf(json({}, 500)))).toBe(false);
    expect(isRejectedByHighLevel(await statusOf(json({}, 503)))).toBe(false);
    const network = await statusOf(new Error("boom"));
    expect((network as HighLevelHttpError).status).toBeNull();
    expect(isRejectedByHighLevel(network)).toBe(false);
    expect(isRejectedByHighLevel(new Error("other"))).toBe(false);
    expect(isRejectedByHighLevel("text")).toBe(false);
  });

  it("applies to the other operations too (mintLocationToken answers 404)", async () => {
    const client = createHighLevelClient({ ...config, fetch: async () => json({}, 404) });
    const error = await client.mintLocationToken("agency", "company_1", "loc_1").catch((e: unknown) => e);
    expect(isRejectedByHighLevel(error)).toBe(true);
  });
});
