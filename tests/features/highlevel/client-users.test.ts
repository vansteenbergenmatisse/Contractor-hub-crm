import { describe, expect, it, vi } from "vitest";
import { createHighLevelClient, HighLevelHttpError } from "@/features/highlevel";

// Shape follows docs/greenlane/hl-api-notes.md (GET /users/search, read from the docs, not yet seen
// on a real response). Values are fake.
const config = {
  baseUrl: "https://hl.example.test",
  appId: "app-id-1",
  clientId: "client-id-1",
  clientSecret: "client-secret-1",
  redirectUri: "https://app.example.test/api/integrations/oauth/callback",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const apiUser = {
  id: "user_1",
  name: "Pat Owner",
  firstName: "Pat",
  lastName: "Owner",
  email: "pat@example.test",
  phone: "+10000000000",
  deleted: false,
  roles: { type: "account", role: "admin", locationIds: ["loc_1"], restrictSubAccount: false },
  permissions: { contactsEnabled: true },
};

describe("HighLevel client: searchUsers", () => {
  it("calls GET /users/search with the location, company, query and bearer token, and maps the users", async () => {
    const fetchFn = vi.fn(async () => json({ users: [apiUser], count: 1 }));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });

    const users = await client.searchUsers("loc-access", {
      companyId: "comp_1",
      locationId: "loc_1",
      query: "pat@example.test",
    });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://hl.example.test/users/search");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      companyId: "comp_1",
      locationId: "loc_1",
      query: "pat@example.test",
      limit: "25",
    });
    expect(init.method ?? "GET").toBe("GET");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer loc-access");
    expect(headers.get("version")).toBe("v3");
    expect(users).toEqual([
      {
        id: "user_1",
        email: "pat@example.test",
        name: "Pat Owner",
        deleted: false,
        roleType: "account",
        role: "admin",
        locationIds: ["loc_1"],
      },
    ]);
  });

  it("treats a missing deleted flag as not deleted and tolerates unknown extra fields", async () => {
    const { deleted, ...rest } = apiUser;
    void deleted;
    const client = createHighLevelClient({
      ...config,
      fetch: async () => json({ users: [{ ...rest, somethingNew: { a: 1 } }], count: 1 }),
    });
    const [user] = await client.searchUsers("t", { companyId: "c", locationId: "l", query: "x" });
    expect(user.deleted).toBe(false);
  });

  it("returns an empty list when nobody matches", async () => {
    const client = createHighLevelClient({ ...config, fetch: async () => json({ users: [], count: 0 }) });
    expect(await client.searchUsers("t", { companyId: "c", locationId: "l", query: "x" })).toEqual([]);
  });

  it("drops a user entry without a usable id or email instead of failing the whole list", async () => {
    const client = createHighLevelClient({
      ...config,
      fetch: async () => json({ users: [{ id: "u2" }, { email: "a@example.test" }, apiUser], count: 3 }),
    });
    const users = await client.searchUsers("t", { companyId: "c", locationId: "l", query: "x" });
    expect(users.map((u) => u.id)).toEqual(["user_1"]);
  });

  it("rejects a response without a users array", async () => {
    const client = createHighLevelClient({ ...config, fetch: async () => json({ nope: true }) });
    await expect(
      client.searchUsers("t", { companyId: "c", locationId: "l", query: "x" }),
    ).rejects.toThrow(/unexpected response/);
  });

  it("throws HighLevelHttpError carrying only the status, never the body or token", async () => {
    const client = createHighLevelClient({
      ...config,
      fetch: async () => json({ message: "secret-body loc-access" }, 401),
    });
    const error = await client
      .searchUsers("loc-access", { companyId: "c", locationId: "l", query: "x" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(HighLevelHttpError);
    expect(error.status).toBe(401);
    expect(String(error.message)).not.toMatch(/secret-body|loc-access/);
  });

  it("maps a network failure to a status-less HighLevelHttpError", async () => {
    const client = createHighLevelClient({
      ...config,
      fetch: async () => {
        throw new Error("boom loc-access");
      },
    });
    const error = await client
      .searchUsers("loc-access", { companyId: "c", locationId: "l", query: "x" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(HighLevelHttpError);
    expect(error.status).toBeNull();
    expect(String(error.message)).not.toMatch(/boom|loc-access/);
  });
});
