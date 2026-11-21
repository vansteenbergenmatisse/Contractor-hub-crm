import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aadFor, decrypt, encrypt } from "@/shared/lib/encryption";

// The real route with the real handler, client, token service and stores. Only Prisma and fetch are
// faked, and the signing key is a test key. This pins the wiring that webhook-reconcile.test.ts
// cannot see: the agency token comes from the token service (so an expired one is refreshed), the
// reconcile dependency is present, and the stored tenant's company is looked up.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const key = randomBytes(32).toString("base64");
const ENV = {
  GHL_APP_ID: "app-1",
  GHL_CLIENT_ID: "client-id-1",
  GHL_CLIENT_SECRET: "client-secret-1",
  GHL_APP_SHARED_SECRET: "shared-1",
  GHL_REDIRECT_URI: "https://app.example.test/api/integrations/oauth/callback",
  GHL_API_BASE_URL: "https://hl.example.test",
  GHL_INSTALL_BASE_URL: "https://install.example.test",
  TOKEN_ENCRYPTION_KEY: key,
};

let agencyRow: Record<string, unknown>;
let agencyUpdates: Record<string, unknown>[];
const fake = {
  tenant: {
    findUnique: vi.fn(async () => ({ id: "tenant_1", companyId: "company_1" })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  webhookEvent: {
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    findUnique: vi.fn(async () => null),
  },
  hlLocationConnection: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  hlAgencyConnection: {
    findUnique: vi.fn(async () => agencyRow),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => {
      agencyUpdates.push(args.data);
      agencyRow = { ...agencyRow, ...args.data };
      return {};
    }),
  },
  $queryRaw: vi.fn(async () => [{ id: "row_1" }]),
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fake)),
};
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => fake }));

import { createWebhookRoute } from "@/features/highlevel";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
let installedItems: { _id: string; isInstalled: boolean }[];
let fetchSpy: ReturnType<typeof vi.fn>;

function signed(body: unknown): Request {
  const raw = JSON.stringify(body);
  return new Request("https://app.example.test/api/integrations/webhooks", {
    method: "POST",
    body: raw,
    headers: { "x-ghl-signature": sign(null, Buffer.from(raw), privateKey).toString("base64") },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  agencyUpdates = [];
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
  // The agency token is EXPIRED, so only the token service can produce a usable one.
  agencyRow = {
    companyId: "company_1",
    accessTokenEnc: encrypt("agency-old", key, aadFor("HlAgencyConnection", "company_1", "accessTokenEnc")),
    refreshTokenEnc: encrypt("agency-refresh-old", key, aadFor("HlAgencyConnection", "company_1", "refreshTokenEnc")),
    expiresAt: new Date(Date.now() - 60_000),
  };
  installedItems = [{ _id: "loc_1", isInstalled: true }];
  fetchSpy = vi.fn(async (url: string) => {
    if (url.endsWith("/oauth/token")) {
      return json({ access_token: "agency-new", refresh_token: "agency-refresh-new", expires_in: 86399 });
    }
    if (url.includes("/oauth/installed-locations")) {
      return json({ items: installedItems, pagination: { hasNextPage: false } });
    }
    throw new Error(`unexpected call ${url}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const uninstall = { type: "UNINSTALL", appId: "app-1", locationId: "loc_1" }; // no companyId, as documented
const route = () => createWebhookRoute({ publicKeyPem });

describe("webhook route wiring", () => {
  it("a replayed UNINSTALL of a live location is acknowledged and switches nothing off, even with an expired agency token", async () => {
    const response = await route()(signed(uninstall));

    expect(response.status).toBe(200);
    expect(fake.tenant.updateMany).not.toHaveBeenCalled();
    expect(fake.hlLocationConnection.deleteMany).not.toHaveBeenCalled();
    // the expired agency token was refreshed (Company) before listing, and the new token was used
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    const refresh = calls.find(([url]) => url.endsWith("/oauth/token"));
    expect(new URLSearchParams(refresh?.[1].body as string).get("user_type")).toBe("Company");
    expect(new URLSearchParams(refresh?.[1].body as string).get("refresh_token")).toBe("agency-refresh-old");
    const listing = calls.find(([url]) => url.includes("/oauth/installed-locations"));
    expect(new Headers(listing?.[1].headers).get("authorization")).toBe("Bearer agency-new");
    expect(listing?.[0]).toContain("companyId=company_1"); // the stored tenant's company, not the payload's
    expect(fake.tenant.findUnique).toHaveBeenCalledWith({ where: { locationId: "loc_1" }, select: { companyId: true } });
    const saved = agencyUpdates[0] as { accessTokenEnc: string; refreshTokenEnc: string };
    expect(decrypt(saved.accessTokenEnc, key, aadFor("HlAgencyConnection", "company_1", "accessTokenEnc"))).toBe("agency-new");
    expect(decrypt(saved.refreshTokenEnc, key, aadFor("HlAgencyConnection", "company_1", "refreshTokenEnc"))).toBe("agency-refresh-new");
  });

  it("a real UNINSTALL (the location is gone from HighLevel's list) switches the tenant off", async () => {
    installedItems = [];
    const response = await route()(signed(uninstall));
    expect(response.status).toBe(200);
    expect(fake.hlLocationConnection.deleteMany).toHaveBeenCalledWith({ where: { locationId: "loc_1" } });
    expect(fake.tenant.updateMany).toHaveBeenCalledTimes(1);
  });

  it("an agency token HighLevel refuses to renew: a signed UNINSTALL is trusted (no listing, tenant switched off), not answered 500", async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.endsWith("/oauth/token")) return new Response("{}", { status: 400 }); // refresh token rejected
      throw new Error(`unexpected call ${url}`);
    });
    const response = await route()(signed(uninstall));
    expect(response.status).toBe(200);
    expect(fake.tenant.updateMany).toHaveBeenCalledTimes(1);
    const urls = (fetchSpy.mock.calls as unknown as [string][]).map(([url]) => url);
    expect(urls.some((url) => url.includes("installed-locations"))).toBe(false);
    expect(agencyUpdates).toEqual([]); // nothing stored from a failed refresh
  });

  it("an agency token that fails only temporarily makes the UNINSTALL answer 500 so HighLevel retries", async () => {
    fetchSpy.mockImplementation(async () => new Response("{}", { status: 503 }));
    const response = await route()(signed(uninstall));
    expect(response.status).toBe(500);
    expect(fake.tenant.updateMany).not.toHaveBeenCalled();
  });

  it("an INSTALL for a location HighLevel does not list answers 500 and mints nothing", async () => {
    installedItems = [];
    const response = await route()(signed({ type: "INSTALL", appId: "app-1", locationId: "loc_1", companyId: "company_1" }));
    expect(response.status).toBe(500);
    const urls = (fetchSpy.mock.calls as unknown as [string][]).map(([url]) => url);
    expect(urls.some((url) => url.includes("location-token"))).toBe(false);
  });

  it("the default route still verifies with HighLevel's key, so a test-key signature is refused", async () => {
    const response = await createWebhookRoute()(signed(uninstall));
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
