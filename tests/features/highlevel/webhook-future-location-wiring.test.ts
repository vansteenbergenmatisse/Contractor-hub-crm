import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aadFor, encrypt } from "@/shared/lib/encryption";

// The real route: an INSTALL without companyId must search the agencies stored in the database.
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

const agencyRow = () => ({
  companyId: "company_1",
  accessTokenEnc: encrypt("agency-access", key, aadFor("HlAgencyConnection", "company_1", "accessTokenEnc")),
  refreshTokenEnc: encrypt("agency-refresh", key, aadFor("HlAgencyConnection", "company_1", "refreshTokenEnc")),
  expiresAt: new Date(Date.now() + 3_600_000),
});
const fake = {
  tenant: { findUnique: vi.fn(async (): Promise<Record<string, unknown> | null> => null) },
  webhookEvent: { create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) },
  hlAgencyConnection: {
    findMany: vi.fn(async () => [{ companyId: "company_1" }]),
    findUnique: vi.fn(async () => agencyRow()),
  },
};
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => fake }));

import { createWebhookRoute } from "@/features/highlevel";

function signed(body: unknown): Request {
  const raw = JSON.stringify(body);
  return new Request("https://app.example.test/api/integrations/webhooks", {
    method: "POST",
    body: raw,
    headers: { "x-ghl-signature": sign(null, Buffer.from(raw), privateKey).toString("base64") },
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
  fetchSpy = vi.fn(async (url: string) => {
    if (url.includes("/oauth/installed-locations")) {
      return new Response(JSON.stringify({ items: [], pagination: { hasNextPage: false } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("unexpected call");
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("webhook route wiring: INSTALL without companyId", () => {
  it("reads the stored agencies and checks HighLevel's list with that agency's token", async () => {
    const route = createWebhookRoute({ publicKeyPem });
    const response = await route(signed({ type: "INSTALL", appId: "app-1", locationId: "loc_new", webhookId: "wh_1" }));

    expect(response.status).toBe(500); // not listed yet, so HighLevel retries
    expect(fake.hlAgencyConnection.findMany).toHaveBeenCalledTimes(1);
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    const listing = calls.find(([url]) => url.includes("/oauth/installed-locations"));
    expect(listing?.[0]).toContain("companyId=company_1");
    expect(new Headers(listing?.[1].headers).get("authorization")).toBe("Bearer agency-access");
  });

  it("a replay on a connected tenant makes no HighLevel call", async () => {
    const connected = { id: "tenant_1", companyId: "company_1", status: "connected" };
    fake.tenant.findUnique.mockResolvedValueOnce(connected).mockResolvedValueOnce(connected);
    const route = createWebhookRoute({ publicKeyPem });
    const response = await route(signed({ type: "INSTALL", appId: "app-1", locationId: "loc_new", webhookId: "wh_2" }));

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fake.hlAgencyConnection.findUnique).not.toHaveBeenCalled();
  });
});
