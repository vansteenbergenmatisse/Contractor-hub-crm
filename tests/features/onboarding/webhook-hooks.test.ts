import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebhook, type WebhookDeps } from "@/features/highlevel";
import { createWebhookHooks, type WebhookHookDeps } from "@/features/onboarding";

// The onboarding hooks behind the HighLevel webhook. A LocationUpdate drops the cached brand of the
// tenant that owns the signed event's location, so new custom values show on the next page load.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const APP = "app-1";
const NOW = new Date("2026-11-22T10:00:00.000Z");
const signed = (body: unknown, key = privateKey) => {
  const raw = JSON.stringify(body);
  return new Request("https://app.example.test/w", { method: "POST", body: raw, headers: { "x-ghl-signature": sign(null, Buffer.from(raw), key).toString("base64") } });
};

const TENANTS: Record<string, { tenantId: string; companyId: string | null; status: string }> = {
  loc_1: { tenantId: "t1", companyId: "co_1", status: "connected" },
  loc_2: { tenantId: "t2", companyId: "co_1", status: "connected" },
};

let hookDeps: WebhookHookDeps;
let invalidateBrand: ReturnType<typeof vi.fn<(tenantId: string) => void>>;
let deps: WebhookDeps;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  invalidateBrand = vi.fn<(tenantId: string) => void>();
  hookDeps = {
    hl: {
      findTenant: vi.fn(async (locationId: string) => TENANTS[locationId] ?? null),
      renameTenant: vi.fn(async () => true),
      usersOfTenant: vi.fn(async () => []),
      usersWithToken: vi.fn(async () => []),
    },
    userSync: { provision: vi.fn(), deactivate: vi.fn(), activeLinks: vi.fn(async () => []) },
    invalidateBrand,
  };
  deps = {
    appId: APP, publicKeyPem, now: () => NOW, newId: () => "gen",
    store: {
      begin: vi.fn(async () => "process" as const),
      markProcessed: vi.fn(async () => {}),
      readAgencyAccessToken: vi.fn(async () => "agency-access"),
      saveLocationConnection: vi.fn(async () => ({ tenantId: "t1" })),
      markLocationUninstalled: vi.fn(async () => {}),
      deleteAgencyConnection: vi.fn(async () => {}),
    },
    client: { mintLocationToken: vi.fn() },
    hooks: createWebhookHooks(hookDeps),
  };
});

describe("LocationUpdate invalidates the brand cache", () => {
  it("invalidates the tenant that owns the event's location, and renames it", async () => {
    const response = await handleWebhook(signed({ type: "LocationUpdate", id: "loc_2", companyId: "co_1", name: "New Name" }), deps);
    expect(response.status).toBe(200);
    expect(hookDeps.hl.findTenant).toHaveBeenCalledWith("loc_2");
    expect(invalidateBrand).toHaveBeenCalledTimes(1);
    expect(invalidateBrand).toHaveBeenCalledWith("t2");
    expect(hookDeps.hl.renameTenant).toHaveBeenCalledWith("loc_2", "New Name");
  });

  it("invalidates even when the event carries no new name", async () => {
    await handleWebhook(signed({ type: "LocationUpdate", id: "loc_1" }), deps);
    expect(invalidateBrand).toHaveBeenCalledWith("t1");
    expect(hookDeps.hl.renameTenant).not.toHaveBeenCalled();
  });

  it("still invalidates when the rename fails, and answers 200", async () => {
    vi.mocked(hookDeps.hl.renameTenant).mockRejectedValueOnce(new Error("db"));
    const response = await handleWebhook(signed({ type: "LocationUpdate", id: "loc_1", name: "X" }), deps);
    expect(response.status).toBe(200);
    expect(invalidateBrand).toHaveBeenCalledWith("t1");
  });

  it("an unknown location invalidates nothing and does not throw", async () => {
    const response = await handleWebhook(signed({ type: "LocationUpdate", id: "loc_unknown", name: "X" }), deps);
    expect(response.status).toBe(200);
    expect(invalidateBrand).not.toHaveBeenCalled();
  });

  it("a failing tenant lookup invalidates nothing and still answers 200", async () => {
    vi.mocked(hookDeps.hl.findTenant).mockRejectedValueOnce(new Error("db down"));
    const response = await handleWebhook(signed({ type: "LocationUpdate", id: "loc_1", name: "X" }), deps);
    expect(response.status).toBe(200);
    expect(invalidateBrand).not.toHaveBeenCalled();
  });

  it("a failing invalidate does not throw out of the webhook", async () => {
    invalidateBrand.mockImplementationOnce(() => { throw new Error("boom"); });
    const response = await handleWebhook(signed({ type: "LocationUpdate", id: "loc_1", name: "X" }), deps);
    expect(response.status).toBe(200);
  });

  it("an event with a bad signature never reaches the hook", async () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    const response = await handleWebhook(signed({ type: "LocationUpdate", id: "loc_1" }, other), deps);
    expect(response.status).toBe(401);
    expect(hookDeps.hl.findTenant).not.toHaveBeenCalled();
    expect(invalidateBrand).not.toHaveBeenCalled();
  });

  it("user events do not invalidate the brand", async () => {
    await handleWebhook(signed({ type: "UserCreate", locationId: "loc_1" }), deps);
    expect(invalidateBrand).not.toHaveBeenCalled();
  });
});
