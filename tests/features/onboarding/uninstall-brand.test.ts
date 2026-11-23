import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebhook, type WebhookDeps } from "@/features/highlevel";
import { createWebhookHooks, type WebhookHookDeps } from "../../../src/features/onboarding/api/hooks";

// Fake ids only.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const signed = (body: unknown) => {
  const raw = JSON.stringify(body);
  return new Request("https://app.example.test/api/integrations/webhooks", {
    method: "POST",
    body: raw,
    headers: { "x-ghl-signature": sign(null, Buffer.from(raw), privateKey).toString("base64") },
  });
};

let invalidateBrand: ReturnType<typeof vi.fn<(tenantId: string) => void>>;
let hookDeps: WebhookHookDeps;
let markLocationUninstalled: ReturnType<typeof vi.fn<(locationId: string, now: Date) => Promise<void>>>;
const webhookDeps = (hooks: ReturnType<typeof createWebhookHooks>): WebhookDeps => ({
  appId: "app-1", publicKeyPem, now: () => new Date("2026-11-23T10:00:00.000Z"), newId: () => "gen",
  store: {
    begin: vi.fn(async () => "process" as const),
    markProcessed: vi.fn(async () => {}),
    readAgencyAccessToken: vi.fn(async () => "agency-access"),
    saveLocationConnection: vi.fn(async () => ({ tenantId: "t1" })),
    markLocationUninstalled,
    deleteAgencyConnection: vi.fn(async () => {}),
  },
  client: { mintLocationToken: vi.fn() },
  hooks,
  onLocationUninstalled: hooks.onLocationUninstalled,
});
const uninstall = { type: "UNINSTALL", appId: "app-1", locationId: "loc_1" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  invalidateBrand = vi.fn<(tenantId: string) => void>();
  markLocationUninstalled = vi.fn(async () => {});
  hookDeps = {
    hl: {
      findTenant: vi.fn(async (locationId: string) => (locationId === "loc_1" ? { tenantId: "t1", companyId: "co_1", status: "uninstalled" } : null)),
      renameTenant: vi.fn(async () => true),
      usersOfTenant: vi.fn(async () => []),
      usersWithToken: vi.fn(async () => []),
    },
    userSync: { provision: vi.fn(), deactivate: vi.fn(), activeLinks: vi.fn(async () => []) },
    invalidateBrand,
  } as unknown as WebhookHookDeps;
});

describe("UNINSTALL and the kept brand values", () => {
  it("clears the tenant's kept values after marking it uninstalled", async () => {
    const response = await handleWebhook(signed(uninstall), webhookDeps(createWebhookHooks(hookDeps)));
    expect(response.status).toBe(200);
    expect(invalidateBrand).toHaveBeenCalledWith("t1");
    expect(markLocationUninstalled.mock.invocationCallOrder[0]).toBeLessThan(invalidateBrand.mock.invocationCallOrder[0]);
  });

  it("does nothing for a location without a tenant", async () => {
    await createWebhookHooks(hookDeps).onLocationUninstalled?.({ locationId: "loc_x" });
    expect(invalidateBrand).not.toHaveBeenCalled();
  });

  it("still answers 200 when clearing fails", async () => {
    invalidateBrand.mockImplementation(() => {
      throw new Error("boom");
    });
    const response = await handleWebhook(signed(uninstall), webhookDeps(createWebhookHooks(hookDeps)));
    expect(response.status).toBe(200);
  });

  it("does not clear anything when the uninstall is refused as still installed", async () => {
    const deps = webhookDeps(createWebhookHooks(hookDeps));
    deps.reconcile = {
      listInstalledLocations: vi.fn(async () => [{ locationId: "loc_1" }]) as never,
      readLocationCompanyId: vi.fn(async () => "co_1"),
    };
    await handleWebhook(signed({ ...uninstall, companyId: "co_1" }), deps);
    expect(markLocationUninstalled).not.toHaveBeenCalled();
    expect(invalidateBrand).not.toHaveBeenCalled();
  });
});
