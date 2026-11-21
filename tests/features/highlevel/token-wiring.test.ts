import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aadFor, decrypt, encrypt } from "@/shared/lib/encryption";

// Real client, real store, real service. Only Prisma and fetch are faked, so this checks the wiring:
// the key and the HighLevel config reach the right places.
const key = randomBytes(32).toString("base64");
const ENV = {
  GHL_APP_ID: "app-id-1",
  GHL_CLIENT_ID: "client-id-1",
  GHL_CLIENT_SECRET: "client-secret-1",
  GHL_APP_SHARED_SECRET: "shared-1",
  GHL_REDIRECT_URI: "https://app.example.test/api/integrations/oauth/callback",
  GHL_API_BASE_URL: "https://hl.example.test",
  GHL_INSTALL_BASE_URL: "https://install.example.test",
  TOKEN_ENCRYPTION_KEY: key,
};

const NOW = Date.now();
let row: Record<string, unknown>;
let updates: Record<string, unknown>[];
const fake = {
  hlLocationConnection: {
    findUnique: vi.fn(async () => row),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => {
      updates.push(args.data);
      row = { ...row, ...args.data };
      return {};
    }),
  },
  $queryRaw: vi.fn(async () => [{ id: "row_1" }]),
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fake)),
};
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => fake }));

import { getTokenService, TokenServiceError } from "@/features/highlevel";

beforeEach(() => {
  updates = [];
  row = {
    tenantId: "tenant_1",
    locationId: "loc_1",
    accessTokenEnc: encrypt("old-access", key, aadFor("HlLocationConnection", "tenant_1", "accessTokenEnc")),
    refreshTokenEnc: encrypt("old-refresh", key, aadFor("HlLocationConnection", "tenant_1", "refreshTokenEnc")),
    expiresAt: new Date(NOW + 60_000), // under 5 minutes left
    tenant: { status: "connected", companyId: "company_1" },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getTokenService", () => {
  it("throws, naming no value, when the environment is incomplete", () => {
    for (const name of Object.keys(ENV)) vi.stubEnv(name, "");
    expect(() => getTokenService()).toThrow();
  });

  it("refreshes through HighLevel with the configured client and stores the result under the real key", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({ access_token: "fresh-access", refresh_token: "fresh-refresh", expires_in: 86399 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const token = await getTokenService().getLocationToken("tenant_1");

    expect(token).toBe("fresh-access");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hl.example.test/oauth/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("client_id")).toBe("client-id-1");
    expect(body.get("client_secret")).toBe("client-secret-1");
    expect(body.get("refresh_token")).toBe("old-refresh");
    expect(body.get("user_type")).toBe("Location");
    const saved = updates[0] as { accessTokenEnc: string; refreshTokenEnc: string };
    expect(decrypt(saved.accessTokenEnc, key, aadFor("HlLocationConnection", "tenant_1", "accessTokenEnc"))).toBe("fresh-access");
    expect(decrypt(saved.refreshTokenEnc, key, aadFor("HlLocationConnection", "tenant_1", "refreshTokenEnc"))).toBe("fresh-refresh");
  });

  it("reports unavailable, not a leak, when HighLevel answers 503", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret-upstream-text", { status: 503 })));
    const error = (await getTokenService().getLocationToken("tenant_1").catch((e: unknown) => e)) as TokenServiceError;
    expect(error).toBeInstanceOf(TokenServiceError);
    expect(error.code).toBe("unavailable");
    expect(error.message).not.toContain("secret-upstream-text");
    expect(updates).toEqual([]);
  });
});
