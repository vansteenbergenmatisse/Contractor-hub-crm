import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthCallbackRoute, oauthStartRoute } from "@/features/highlevel";

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
const callback = new Request(
  "https://app.example.test/api/integrations/oauth/callback?code=c&state=nope",
  { headers: { cookie: `__Secure-gl_oauth_state=${"s".repeat(43)}` } },
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OAuth routes", () => {
  it.each([
    ["start", oauthStartRoute, start],
    ["callback", oauthCallbackRoute, callback],
  ])("%s answers 500 without naming anything when env is missing", async (_name, route, request) => {
    for (const name of Object.keys(ENV)) vi.stubEnv(name, "");
    const response = await route(request);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toBe("Server is not configured.");
  });

  it("start denies everyone until sign-in exists (ticket 6), even with a complete env", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const response = await oauthStartRoute(start);
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("start denies even a request that claims to be an admin", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const forged = new Request(start.url, { headers: { "x-role": "admin", cookie: "role=admin" } });
    expect((await oauthStartRoute(forged)).status).toBe(403);
  });

  it("callback rejects a state mismatch with 400 and makes no outbound call", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await oauthCallbackRoute(callback);
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
