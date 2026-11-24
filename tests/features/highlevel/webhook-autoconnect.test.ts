import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { handleWebhook } from "@/features/highlevel";
import type { WebhookDeps } from "@/features/highlevel";

// Auto-connect of a NEW sub-account: LocationCreate (agency-level event, no appId, location id in
// `id`), the company-less INSTALL with several stored agencies, and the listed name on INSTALL.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const NOW = new Date("2026-11-24T10:00:00.000Z");
const APP_ID = "app-1";

function signed(body: unknown): Request {
  const raw = JSON.stringify(body);
  return new Request("https://app.example.test/api/integrations/webhooks", {
    method: "POST",
    body: raw,
    headers: { "x-ghl-signature": sign(null, Buffer.from(raw), privateKey).toString("base64") },
  });
}

const created = { type: "LocationCreate", id: "loc_new", companyId: "agency_a", name: "New Client LLC", email: "x@example.test" };
const listedHere = [{ locationId: "loc_new", name: "New Client (listed)" }];
const listedElsewhere = [{ locationId: "loc_other", name: null }];

type Reconcile = NonNullable<WebhookDeps["reconcile"]>;
type Lookup = NonNullable<WebhookDeps["companylessInstall"]>;
let store: { [K in keyof WebhookDeps["store"]]: Mock<WebhookDeps["store"][K]> };
let client: { mintLocationToken: Mock<WebhookDeps["client"]["mintLocationToken"]> };
let reconcile: { [K in keyof Reconcile]: Mock<Reconcile[K]> };
let installsToFutureLocations: Mock<NonNullable<WebhookDeps["installsToFutureLocations"]>>;
let lookup: { [K in keyof Lookup]: Mock<Lookup[K]> };
let onLocationConnected: Mock<NonNullable<NonNullable<WebhookDeps["hooks"]>["onLocationConnected"]>>;
let deps: WebhookDeps;

beforeEach(() => {
  store = {
    begin: vi.fn(async () => "process" as const),
    markProcessed: vi.fn(async () => {}),
    readAgencyAccessToken: vi.fn(async (companyId: string) => `token-${companyId}`),
    saveLocationConnection: vi.fn(async () => ({ tenantId: "t1" })),
    markLocationUninstalled: vi.fn(async () => {}),
    deleteAgencyConnection: vi.fn(async () => {}),
  };
  client = {
    mintLocationToken: vi.fn(async (_a: string, _c: string, locationId: string) => ({
      accessToken: "loc-access",
      refreshToken: "loc-refresh",
      expiresInSeconds: 86400,
      locationId,
    })),
  };
  reconcile = {
    listInstalledLocations: vi.fn(async () => listedHere),
    readLocationCompanyId: vi.fn(async () => null),
  };
  installsToFutureLocations = vi.fn(async () => null);
  lookup = {
    listAgencyCompanyIds: vi.fn(async () => ["agency_a"]),
    findTenant: vi.fn(async () => null),
  };
  onLocationConnected = vi.fn(async () => {});
  deps = {
    appId: APP_ID,
    publicKeyPem,
    now: () => NOW,
    newId: () => "generated-1",
    store,
    client,
    reconcile,
    companylessInstall: lookup,
    installsToFutureLocations,
    hooks: { onLocationConnected },
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

function expectNothingCreated() {
  expect(client.mintLocationToken).not.toHaveBeenCalled();
  expect(store.saveLocationConnection).not.toHaveBeenCalled();
  expect(onLocationConnected).not.toHaveBeenCalled();
}

describe("LocationCreate", () => {
  it("passes the appId gate without an appId and is recorded under the location id", async () => {
    expect((await handleWebhook(signed(created), deps)).status).toBe(200);
    expect(store.begin).toHaveBeenCalledWith(expect.objectContaining({ type: "LocationCreate", locationId: "loc_new", companyId: "agency_a" }));
  });

  it("a location the agency lists as installed is connected with its name, users synced", async () => {
    expect((await handleWebhook(signed(created), deps)).status).toBe(200);
    expect(reconcile.listInstalledLocations).toHaveBeenCalledWith("token-agency_a", "agency_a");
    expect(client.mintLocationToken).toHaveBeenCalledWith("token-agency_a", "agency_a", "loc_new");
    expect(store.saveLocationConnection).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: "loc_new", companyId: "agency_a", name: "New Client LLC", listedAt: NOW }),
    );
    expect(onLocationConnected).toHaveBeenCalledWith({ tenantId: "t1", companyId: "agency_a", locationId: "loc_new", accessToken: "loc-access" });
    expect(store.markProcessed).toHaveBeenCalled();
  });

  it("a different, present appId is still dropped", async () => {
    expect((await handleWebhook(signed({ ...created, appId: "other" }), deps)).status).toBe(200);
    expect(store.begin).not.toHaveBeenCalled();
  });

  it("not listed yet: 500 so HighLevel retries while the install catches up", async () => {
    reconcile.listInstalledLocations.mockResolvedValueOnce(listedElsewhere);
    expect((await handleWebhook(signed(created), deps)).status).toBe(500);
    expectNothingCreated();
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it("not listed and HighLevel says the app is NOT installed on future locations: 200, nothing created", async () => {
    reconcile.listInstalledLocations.mockResolvedValueOnce(listedElsewhere);
    installsToFutureLocations.mockResolvedValueOnce(false);
    expect((await handleWebhook(signed(created), deps)).status).toBe(200);
    expectNothingCreated();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).toContain("location_create_app_not_installed");
  });

  it("an agency we hold no connection for: 200, no HighLevel call", async () => {
    expect((await handleWebhook(signed({ ...created, companyId: "agency_z" }), deps)).status).toBe(200);
    expect(store.readAgencyAccessToken).not.toHaveBeenCalled();
    expect(reconcile.listInstalledLocations).not.toHaveBeenCalled();
    expectNothingCreated();
  });

  it("an already connected tenant: 200, no HighLevel call", async () => {
    lookup.findTenant.mockResolvedValueOnce({ tenantId: "t1", companyId: "agency_a", status: "connected" });
    expect((await handleWebhook(signed(created), deps)).status).toBe(200);
    expect(reconcile.listInstalledLocations).not.toHaveBeenCalled();
    expectNothingCreated();
  });

  it("a tenant stored under another agency: 200, nothing created", async () => {
    lookup.findTenant.mockResolvedValueOnce({ tenantId: "t1", companyId: "agency_b", status: "uninstalled" });
    expect((await handleWebhook(signed(created), deps)).status).toBe(200);
    expectNothingCreated();
  });

  it("no usable agency token: 500 (retry)", async () => {
    store.readAgencyAccessToken.mockResolvedValueOnce(null);
    expect((await handleWebhook(signed(created), deps)).status).toBe(500);
    expectNothingCreated();
  });

  it("without companyId or id: acknowledged, nothing done", async () => {
    expect((await handleWebhook(signed({ type: "LocationCreate", id: "loc_new" }), deps)).status).toBe(200);
    expect((await handleWebhook(signed({ type: "LocationCreate", companyId: "agency_a" }), deps)).status).toBe(200);
    expect(lookup.listAgencyCompanyIds).not.toHaveBeenCalled();
    expectNothingCreated();
  });

  it("a users-sync failure after connecting still answers 200 (the reconcile repairs users)", async () => {
    onLocationConnected.mockRejectedValueOnce(new Error("users down"));
    expect((await handleWebhook(signed(created), deps)).status).toBe(200);
    expect(store.saveLocationConnection).toHaveBeenCalledTimes(1);
    expect(store.markProcessed).toHaveBeenCalled();
  });

  it("without the reconcile wiring it is only stored", async () => {
    expect((await handleWebhook(signed(created), { ...deps, reconcile: undefined })).status).toBe(200);
    expectNothingCreated();
  });
});

describe("INSTALL without companyId and several agencies", () => {
  const future = { type: "INSTALL", appId: APP_ID, locationId: "loc_new", webhookId: "wh_future" };

  it("uses the agency the stored (not connected) tenant belongs to", async () => {
    lookup.listAgencyCompanyIds.mockResolvedValueOnce(["agency_a", "agency_b"]);
    lookup.findTenant.mockResolvedValueOnce({ tenantId: "t1", companyId: "agency_b", status: "needs_reconnect" });
    expect((await handleWebhook(signed(future), deps)).status).toBe(200);
    expect(reconcile.listInstalledLocations).toHaveBeenCalledWith("token-agency_b", "agency_b");
    expect(store.saveLocationConnection).toHaveBeenCalledWith(expect.objectContaining({ companyId: "agency_b", locationId: "loc_new" }));
  });

  it("a stored tenant of an agency we no longer hold: nothing created", async () => {
    lookup.listAgencyCompanyIds.mockResolvedValueOnce(["agency_a", "agency_b"]);
    lookup.findTenant.mockResolvedValueOnce({ tenantId: "t1", companyId: "agency_z", status: "uninstalled" });
    expect((await handleWebhook(signed(future), deps)).status).toBe(200);
    expectNothingCreated();
  });
});

describe("INSTALL keeps the listed name", () => {
  it("saves the name HighLevel's installed list gives", async () => {
    const response = await handleWebhook(signed({ type: "INSTALL", appId: APP_ID, locationId: "loc_new", companyId: "agency_a" }), deps);
    expect(response.status).toBe(200);
    expect(store.saveLocationConnection).toHaveBeenCalledWith(expect.objectContaining({ name: "New Client (listed)" }));
  });
});
