import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthCallbackRoute, oauthStartRoute, type AdminGuard } from "@/features/highlevel";

// The admin guard is injected by src/app (the auth feature imports highlevel, not the reverse).
const ENV = {
  GHL_APP_ID: "app-id-1",
  GHL_CLIENT_ID: "client-id-1",
  GHL_CLIENT_SECRET: "client-secret-1",
  GHL_APP_SHARED_SECRET: "shared-1",
  GHL_REDIRECT_URI: "https://app.example.test/api/integrations/oauth/callback",
  GHL_API_BASE_URL: "https://hl.example.test",
  GHL_INSTALL_BASE_URL: "https://install.example.test",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};
const start = new Request("https://app.example.test/api/integrations/oauth/start");
const guard = (id: string | null, admin = id !== null): AdminGuard => ({
  isAdmin: async () => admin,
  adminId: async () => id,
});
const setEnv = () => Object.entries(ENV).forEach(([k, v]) => vi.stubEnv(k, v));
const stateOf = (response: Response) => new URL(response.headers.get("location") as string).searchParams.get("state") as string;

afterEach(() => vi.unstubAllEnvs());

describe("oauth start with an injected admin guard", () => {
  it("redirects an admin to the install page with a signed state and sets the state cookie", async () => {
    setEnv();
    const response = await oauthStartRoute(start, guard("admin_1"));
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location") as string).origin).toBe("https://install.example.test");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("denies a non-admin, an admin without an id, and a missing guard", async () => {
    setEnv();
    expect((await oauthStartRoute(start, guard(null, false))).status).toBe(403);
    expect((await oauthStartRoute(start, guard(null, true))).status).toBe(403);
    expect((await oauthStartRoute(start)).status).toBe(403);
  });
});

describe("oauth callback binds the state to the admin who started it", () => {
  async function callbackAs(startedBy: string, now: AdminGuard) {
    setEnv();
    const started = await oauthStartRoute(start, guard(startedBy));
    const state = stateOf(started);
    const cookie = (started.headers.get("set-cookie") as string).split(";")[0];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await oauthCallbackRoute(
      new Request(`https://app.example.test/api/integrations/oauth/callback?code=c&state=${state}`, { headers: { cookie } }),
      now,
    );
    vi.unstubAllGlobals();
    return { response, fetchSpy };
  }

  it("positive control: the same admin gets past the state check and the code exchange starts", async () => {
    const { fetchSpy } = await callbackAs("admin_1", guard("admin_1"));
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("refuses a state started by another admin, before any outbound call, like a tampered state", async () => {
    const cross = await callbackAs("admin_1", guard("admin_2"));
    expect(cross.response.status).toBe(400); // state mismatch is a 400; "nobody signed in" is the 403 case below
    expect(cross.fetchSpy).not.toHaveBeenCalled();

    setEnv();
    const started = await oauthStartRoute(start, guard("admin_1"));
    const state = stateOf(started);
    const tampered = `${state.slice(0, -2)}${state.endsWith("A") ? "B" : "A"}A`;
    const cookie = (started.headers.get("set-cookie") as string).split(";")[0].replace(state, tampered);
    const tamperedResponse = await oauthCallbackRoute(
      new Request(`https://app.example.test/api/integrations/oauth/callback?code=c&state=${tampered}`, { headers: { cookie } }),
      guard("admin_1"),
    );
    expect(tamperedResponse.status).toBe(cross.response.status);
  });

  it("fails closed without a guard: a state bound to an admin is not accepted", async () => {
    setEnv();
    const started = await oauthStartRoute(start, guard("admin_1"));
    const cookie = (started.headers.get("set-cookie") as string).split(";")[0];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await oauthCallbackRoute(
      new Request(`https://app.example.test/api/integrations/oauth/callback?code=c&state=${stateOf(started)}`, { headers: { cookie } }),
    );
    vi.unstubAllGlobals();
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("two admins get different states", async () => {
    setEnv();
    const one = stateOf(await oauthStartRoute(start, guard("admin_1")));
    const two = stateOf(await oauthStartRoute(start, guard("admin_2")));
    expect(one).not.toBe(two);
  });

  it("refuses when nobody is signed in", async () => {
    const { response, fetchSpy } = await callbackAs("admin_1", guard(null, false));
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
