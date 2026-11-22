import { describe, expect, it, vi } from "vitest";
import { createHighLevelClient } from "@/features/highlevel";

// Fixtures follow the OpenAPI files and docs read on 2026-11-22 (docs/greenlane/hl-api-notes.md). Fake values.
const config = {
  baseUrl: "https://hl.example.test",
  appId: "app-1",
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUri: "https://app.example.test/cb",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const company = { access_token: "a", refresh_token: "r", expires_in: 86399, userType: "Company", companyId: "co_1" };

describe("exchangeCode", () => {
  it("returns a Company token", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const client = createHighLevelClient({ ...config, fetch: async () => json(company) });
    expect(await client.exchangeCode("c")).toEqual({ kind: "company", accessToken: "a", refreshToken: "r", expiresInSeconds: 86399, companyId: "co_1" });
  });

  it("returns a Location token when HighLevel sends one", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const client = createHighLevelClient({ ...config, fetch: async () => json({ access_token: "a", expires_in: 86400, userType: "Location", locationId: "loc_1", companyId: "co_1" }) });
    expect(await client.exchangeCode("c")).toEqual({ kind: "location", accessToken: "a", refreshToken: null, expiresInSeconds: 86400, locationId: "loc_1", companyId: "co_1" });
  });

  it("accepts a lower-case userType and an expires_in sent as a string", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const client = createHighLevelClient({ ...config, fetch: async () => json({ ...company, userType: "company", expires_in: "86399" }) });
    expect((await client.exchangeCode("c")).kind).toBe("company");
  });

  it("refuses an unknown userType and a Company token without companyId, naming what is wrong", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(createHighLevelClient({ ...config, fetch: async () => json({ ...company, userType: "Weird" }) }).exchangeCode("c")).rejects.toThrow(/userType \(Weird\)/);
    await expect(createHighLevelClient({ ...config, fetch: async () => json({ ...company, companyId: undefined }) }).exchangeCode("c")).rejects.toThrow(/companyId/);
  });

  it("logs the userType and the key names, never a value", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await createHighLevelClient({ ...config, fetch: async () => json(company) }).exchangeCode("c");
    const line = String(spy.mock.calls.at(-1)?.[0]);
    expect(line).toContain("userType=Company");
    expect(line).toContain("access_token");
    expect(line).not.toContain("co_1");
    expect(line).not.toMatch(/\ba\b.*\br\b.*86399/);
  });
});

describe("mintLocationToken fallback", () => {
  const minted = { access_token: "la", expires_in: 86399, locationId: "loc_1", refresh_token: "lr" };
  it("falls back to /oauth/locationToken with Version 2021-07-28 after a 404", async () => {
    const fetchFn = vi.fn(async (url: string) => (url.endsWith("/oauth/location-token") ? json({}, 404) : json(minted)));
    const token = await createHighLevelClient({ ...config, fetch: fetchFn as unknown as typeof fetch }).mintLocationToken("t", "co_1", "loc_1");
    expect(token.accessToken).toBe("la");
    const second = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(second[0]).toBe("https://hl.example.test/oauth/locationToken");
    expect(new Headers(second[1].headers).get("version")).toBe("2021-07-28");
  });

  it("does not fall back on a 401", async () => {
    const fetchFn = vi.fn(async () => json({}, 401));
    await expect(createHighLevelClient({ ...config, fetch: fetchFn as unknown as typeof fetch }).mintLocationToken("t", "co_1", "loc_1")).rejects.toThrow(/401/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("listInstalledLocations fallback", () => {
  it("reads the OpenAPI shape (locations[]) after a 404 on the v3 path", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes("/oauth/installed-locations") ? json({}, 404) : json({ locations: [{ _id: "loc_1", name: "A", isInstalled: true }, { _id: "loc_2", isInstalled: false }], count: 2 }),
    );
    const found = await createHighLevelClient({ ...config, fetch: fetchFn as unknown as typeof fetch }).listInstalledLocations("t", "co_1");
    expect(found).toEqual([{ locationId: "loc_1", name: "A" }]);
    expect(String(fetchFn.mock.calls[1][0])).toContain("/oauth/installedLocations?");
  });
});

describe("listLocationUsers", () => {
  const users = { users: [
    { id: "u1", email: "a@x.test", firstName: "Ann", lastName: "Lee", roles: { type: "account", role: "admin", locationIds: ["loc_1"] } },
    { id: "u2", email: "b@x.test", name: "Bo", roles: { type: "agency", role: "admin" } },
    { id: "u3" },
  ] };

  it("calls GET /users/?locationId= and parses names, roles and drops entries without an email", async () => {
    const fetchFn = vi.fn<(url: string) => Promise<Response>>(async () => json(users));
    const list = await createHighLevelClient({ ...config, fetch: fetchFn as unknown as typeof fetch }).listLocationUsers("tok", "co_1", "loc_1");
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://hl.example.test/users/?locationId=loc_1");
    expect(list.map((u) => [u.id, u.name, u.roleType, u.role])).toEqual([["u1", "Ann Lee", "account", "admin"], ["u2", "Bo", "agency", "admin"]]);
  });

  it("falls back to /users/search on a 4xx and not on a 5xx", async () => {
    const fb = vi.fn(async (url: string) => (url.includes("/users/search") ? json(users) : json({}, 404)));
    expect((await createHighLevelClient({ ...config, fetch: fb as unknown as typeof fetch }).listLocationUsers("t", "co_1", "loc_1")).length).toBe(2);
    const down = vi.fn(async () => json({}, 503));
    await expect(createHighLevelClient({ ...config, fetch: down as unknown as typeof fetch }).listLocationUsers("t", "co_1", "loc_1")).rejects.toThrow(/503/);
    expect(down).toHaveBeenCalledTimes(1);
  });
});

describe("listAgencyLocations", () => {
  it("pages with skip and limit until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `l${i}`, name: `N${i}` }));
    const fetchFn = vi.fn(async (url: string) => (url.includes("skip=0") ? json({ locations: full }) : json({ locations: [{ id: "last", name: "L", email: "e@x.test" }] })));
    const list = await createHighLevelClient({ ...config, fetch: fetchFn as unknown as typeof fetch }).listAgencyLocations("t", "co_1");
    expect(list).toHaveLength(101);
    expect(list.at(-1)).toEqual({ locationId: "last", name: "L", email: "e@x.test" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("listLocationUsers: the search fallback pages to the end", () => {
  it("reads every page of /users/search, not just the first 100", async () => {
    const page = (n: number) => ({ users: Array.from({ length: n }, (_, i) => ({ id: `u${i}-${n}`, email: `u${i}-${n}@x.test` })) });
    const fetchFn = vi.fn<(url: string) => Promise<Response>>(async (url) => {
      if (!url.includes("/users/search")) return json({}, 404);
      return url.includes("skip=0") ? json(page(100)) : url.includes("skip=100") ? json(page(40)) : json(page(0));
    });
    const list = await createHighLevelClient({ ...config, fetch: fetchFn as unknown as typeof fetch }).listLocationUsers("t", "co_1", "loc_1");
    expect(list).toHaveLength(140);
  });
});
