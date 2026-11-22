import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { handleOAuthCallback, handleOAuthStart } from "@/features/highlevel";
import type { OAuthCallbackDeps } from "@/features/highlevel";

const NOW = new Date("2026-11-21T10:00:00.000Z");
const SECRET = Buffer.alloc(32, 9).toString("base64");
const COOKIE = "__Secure-gl_oauth_state";

// A real state, minted by the start handler the way production does it.
async function mintState(at: Date, secret = SECRET): Promise<string> {
  const response = await handleOAuthStart(new Request("https://app.example.test/start"), {
    config: { installBaseUrl: "https://install.example.test", clientId: "c", redirectUri: "https://app.example.test/cb" },
    isAdmin: async () => true,
    stateSecret: secret,
    now: () => at,
  });
  return new URL(response.headers.get("location") as string).searchParams.get("state") as string;
}
const STATE = await mintState(NOW);
const OTHER_STATE = await mintState(NOW);

const agencyToken = { accessToken: "agency-access", refreshToken: "agency-refresh", expiresInSeconds: 86399, companyId: "company_1" };

let order: string[];
let deps: OAuthCallbackDeps;
type Client = OAuthCallbackDeps["client"];
type Store = OAuthCallbackDeps["store"];
let client: { [K in keyof Client]: Mock<Client[K]> };
let store: { [K in keyof Store]: Mock<Store[K]> };

beforeEach(() => {
  order = [];
  client = {
    exchangeAgencyCode: vi.fn(async () => {
      order.push("exchange");
      return agencyToken;
    }),
    listInstalledLocations: vi.fn(async () => [
      { locationId: "loc_1", name: "One" },
      { locationId: "loc_2", name: null },
    ]),
    mintLocationToken: vi.fn(async (_a: string, _c: string, locationId: string) => ({
      accessToken: `access-${locationId}`,
      refreshToken: `refresh-${locationId}`,
      expiresInSeconds: 86400,
      locationId,
    })),
  };
  store = {
    saveAgencyConnection: vi.fn(async () => {
      order.push("saveAgency");
    }),
    saveLocationConnection: vi.fn(async () => ({ tenantId: "t" })),
  };
  deps = { client, store, now: () => NOW, stateSecret: SECRET };
});

function callback(query: string, cookie: string | null = `__Secure-gl_oauth_state=${STATE}`): Request {
  return new Request(`https://app.example.test/api/integrations/oauth/callback?${query}`, {
    headers: cookie === null ? {} : { cookie },
  });
}
const good = `code=code-1&state=${STATE}`;

describe("OAuth callback: state check", () => {
  it.each([
    ["no state in the query", "code=code-1", `${COOKIE}=${STATE}`],
    ["no state cookie", good, null],
    ["a different valid state in the query", `code=code-1&state=${OTHER_STATE}`, `${COOKIE}=${STATE}`],
    ["a state of another length", "code=code-1&state=short", `${COOKIE}=${STATE}`],
    ["an empty state", "code=code-1&state=", `${COOKIE}=`],
    ["no code", `state=${STATE}`, `${COOKIE}=${STATE}`],
    ["a forged cookie that matches a forged state", `code=c&state=${"x".repeat(43)}`, `${COOKIE}=${"x".repeat(43)}`],
    ["a forged state with the right shape", `code=c&state=${"A".repeat(22)}.${NOW.getTime() + 60000}.${"A".repeat(43)}`, `${COOKIE}=${"A".repeat(22)}.${NOW.getTime() + 60000}.${"A".repeat(43)}`],
    ["a state with a tampered expiry", `code=c&state=${STATE.replace(/\.\d+\./, `.${NOW.getTime() + 9_999_999}.`)}`, `${COOKIE}=${STATE.replace(/\.\d+\./, `.${NOW.getTime() + 9_999_999}.`)}`],
    ["a state with a tampered signature", `code=c&state=${STATE.slice(0, -2)}AA`, `${COOKIE}=${STATE.slice(0, -2)}AA`],
    ["the old cookie name", good, `gl_oauth_state=${STATE}`],
    ["a cookie name that only ends with the real one", good, `x${COOKIE}=${STATE}`],
    ["two state cookies", good, `${COOKIE}=${OTHER_STATE}; ${COOKIE}=${STATE}`],
    ["two identical valid state cookies", good, `${COOKIE}=${STATE}; ${COOKIE}=${STATE}`],
  ])("rejects %s with 400 and calls nothing", async (_label, query, cookie) => {
    const response = await handleOAuthCallback(callback(query, cookie), deps);
    expect(response.status).toBe(400);
    expect(client.exchangeAgencyCode).not.toHaveBeenCalled();
    expect(store.saveAgencyConnection).not.toHaveBeenCalled();
  });

  it("rejects a validly signed state after it expired", async () => {
    const old = await mintState(new Date(NOW.getTime() - 11 * 60 * 1000));
    const response = await handleOAuthCallback(callback(`code=c&state=${old}`, `${COOKIE}=${old}`), deps);
    expect(response.status).toBe(400);
    expect(client.exchangeAgencyCode).not.toHaveBeenCalled();
  });

  it("rejects a state signed with another secret (another environment)", async () => {
    const foreign = await mintState(NOW, Buffer.alloc(32, 1).toString("base64"));
    const response = await handleOAuthCallback(callback(`code=c&state=${foreign}`, `${COOKIE}=${foreign}`), deps);
    expect(response.status).toBe(400);
    expect(client.exchangeAgencyCode).not.toHaveBeenCalled();
  });

  it("rejects a state at the exact millisecond it expires", async () => {
    const response = await handleOAuthCallback(callback(good), { ...deps, now: () => new Date(NOW.getTime() + 10 * 60 * 1000) });
    expect(response.status).toBe(400);
    expect(client.exchangeAgencyCode).not.toHaveBeenCalled();
  });

  it("accepts a state a little before its expiry", async () => {
    const response = await handleOAuthCallback(callback(good), { ...deps, now: () => new Date(NOW.getTime() + 9 * 60 * 1000) });
    expect(response.status).toBe(200);
  });

  it("does not clear the cookie on a mismatch, so a forged link cannot cancel a real install", async () => {
    const response = await handleOAuthCallback(callback(`code=c&state=${OTHER_STATE}`), deps);
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("finds the state cookie among other cookies", async () => {
    const response = await handleOAuthCallback(
      callback(good, `a=1; ${COOKIE}=${STATE}; b=2`),
      deps,
    );
    expect(response.status).toBe(200);
  });

  it("clears the state cookie once the state matches (single use)", async () => {
    const response = await handleOAuthCallback(callback(good), deps);
    const cookie = response.headers.get("set-cookie") as string;
    expect(cookie).toContain("__Secure-gl_oauth_state=;");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/api/integrations/oauth");
  });

  it("also clears the cookie when the exchange fails", async () => {
    client.exchangeAgencyCode.mockRejectedValue(new Error("HighLevel token exchange failed (status 400)."));
    const response = await handleOAuthCallback(callback(good), deps);
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects an error callback from HighLevel after the state matches, without exchanging", async () => {
    const response = await handleOAuthCallback(callback(`code=code-1&error=access_denied&state=${STATE}`), deps);
    expect(response.status).toBe(400);
    expect(client.exchangeAgencyCode).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("OAuth callback: install", () => {
  it("stores the agency token, then one tenant connection per installed location", async () => {
    const response = await handleOAuthCallback(callback(good), deps);

    expect(client.exchangeAgencyCode).toHaveBeenCalledWith("code-1");
    expect(store.saveAgencyConnection).toHaveBeenCalledWith({
      companyId: "company_1",
      accessToken: "agency-access",
      refreshToken: "agency-refresh",
      expiresAt: new Date(NOW.getTime() + 86399 * 1000),
    });
    expect(client.listInstalledLocations).toHaveBeenCalledWith("agency-access", "company_1");
    expect(client.mintLocationToken).toHaveBeenCalledWith("agency-access", "company_1", "loc_1");
    expect(client.mintLocationToken).toHaveBeenCalledWith("agency-access", "company_1", "loc_2");
    expect(store.saveLocationConnection).toHaveBeenCalledWith({
      locationId: "loc_1",
      companyId: "company_1",
      name: "One",
      accessToken: "access-loc_1",
      refreshToken: "refresh-loc_1",
      expiresAt: new Date(NOW.getTime() + 86400 * 1000),
    });
    expect(store.saveLocationConnection).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: "loc_2", name: null }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ installed: 2, failed: 0 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("stores the agency token before it lists locations", async () => {
    client.listInstalledLocations.mockImplementation(async () => {
      order.push("list");
      return [];
    });
    await handleOAuthCallback(callback(good), deps);
    expect(order).toEqual(["exchange", "saveAgency", "list"]);
  });

  it("continues past a failing location and reports the counts", async () => {
    client.mintLocationToken.mockImplementation(async (_a: string, _c: string, id: string) => {
      if (id === "loc_1") throw new Error("HighLevel location token failed (status 403).");
      return { accessToken: "a", refreshToken: null, expiresInSeconds: 60, locationId: id };
    });
    const response = await handleOAuthCallback(callback(good), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ installed: 1, failed: 1 });
    expect(store.saveLocationConnection).toHaveBeenCalledTimes(1);
    expect(store.saveLocationConnection).toHaveBeenCalledWith({
      locationId: "loc_2",
      companyId: "company_1",
      name: null,
      accessToken: "a",
      refreshToken: null,
      expiresAt: new Date(NOW.getTime() + 60 * 1000),
    });
  });

  it("counts a failing save as a failed location", async () => {
    store.saveLocationConnection.mockRejectedValueOnce(new Error("db down"));
    const response = await handleOAuthCallback(callback(good), deps);
    expect(await response.json()).toEqual({ installed: 1, failed: 1 });
  });

  it("answers 502 when every location failed", async () => {
    client.mintLocationToken.mockRejectedValue(new Error("nope"));
    const response = await handleOAuthCallback(callback(good), deps);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ installed: 0, failed: 2 });
  });

  it("answers 200 with zero installed when HighLevel lists no locations", async () => {
    client.listInstalledLocations.mockResolvedValue([]);
    const response = await handleOAuthCallback(callback(good), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ installed: 0, failed: 0 });
  });

  it("answers 502 and mints nothing when the exchange fails", async () => {
    client.exchangeAgencyCode.mockRejectedValue(new Error("boom"));
    const response = await handleOAuthCallback(callback(good), deps);
    expect(response.status).toBe(502);
    expect(client.listInstalledLocations).not.toHaveBeenCalled();
  });

  it("answers 502 and lists nothing when the agency token cannot be stored", async () => {
    store.saveAgencyConnection.mockRejectedValue(new Error("db down"));
    const response = await handleOAuthCallback(callback(good), deps);
    expect(response.status).toBe(502);
    expect(client.listInstalledLocations).not.toHaveBeenCalled();
  });

  it("answers 502 when listing locations fails", async () => {
    client.listInstalledLocations.mockRejectedValue(new Error("list failed"));
    const response = await handleOAuthCallback(callback(good), deps);
    expect(response.status).toBe(502);
  });

  it("never puts a token, a code or an error message in the response", async () => {
    client.mintLocationToken.mockRejectedValue(new Error("leak agency-access"));
    client.exchangeAgencyCode.mockResolvedValue(agencyToken);
    const response = await handleOAuthCallback(callback(good), deps);
    const text = await response.text();
    for (const secret of ["agency-access", "agency-refresh", "code-1", "leak"]) {
      expect(text).not.toContain(secret);
    }
  });

  // Policy changed by the user (2026-11-21): the log carries the step, message and stack; a token or
  // code in key=value form is redacted. The 502 response stays empty.
  it("logs the step and the real message but no token or code, and a 502 has an empty body", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    client.exchangeAgencyCode.mockRejectedValue(new Error("secret-detail access_token=agency-access code=code-1"));
    const response = await handleOAuthCallback(callback(good), deps);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
    client.exchangeAgencyCode.mockResolvedValue(agencyToken);
    client.mintLocationToken.mockRejectedValue(new Error("mint-detail access_token=agency-access"));
    await handleOAuthCallback(callback(good), deps);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("secret-detail");
    expect(logged).toContain("mint-detail");
    expect(logged).toContain("token exchange");
    for (const secret of ["agency-access", "agency-refresh", "code-1"]) {
      expect(logged).not.toContain(secret);
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
