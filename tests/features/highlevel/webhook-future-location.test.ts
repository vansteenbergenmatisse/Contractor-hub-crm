import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { handleWebhook } from "@/features/highlevel";
import type { WebhookDeps } from "@/features/highlevel";

// A sub-account added later to a "Select all" install: HighLevel may send its INSTALL without a
// companyId. We act only when we hold exactly one agency and that agency's list names the location.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const NOW = new Date("2026-11-22T10:00:00.000Z");
const APP_ID = "app-1";

function signed(body: unknown): Request {
  const raw = JSON.stringify(body);
  return new Request("https://app.example.test/api/integrations/webhooks", {
    method: "POST",
    body: raw,
    headers: { "x-ghl-signature": sign(null, Buffer.from(raw), privateKey).toString("base64") },
  });
}

const future = { type: "INSTALL", appId: APP_ID, locationId: "loc_new", webhookId: "wh_future" };
const listedHere = [{ locationId: "loc_new", name: null }];
const listedElsewhere = [{ locationId: "loc_other", name: null }];

type Reconcile = NonNullable<WebhookDeps["reconcile"]>;
type Lookup = NonNullable<WebhookDeps["companylessInstall"]>;
let store: { [K in keyof WebhookDeps["store"]]: Mock<WebhookDeps["store"][K]> };
let client: { mintLocationToken: Mock<WebhookDeps["client"]["mintLocationToken"]> };
let reconcile: { [K in keyof Reconcile]: Mock<Reconcile[K]> };
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
    hooks: { onLocationConnected },
  };
});

afterEach(() => vi.restoreAllMocks());

function expectNothingCreated() {
  expect(client.mintLocationToken).not.toHaveBeenCalled();
  expect(store.saveLocationConnection).not.toHaveBeenCalled();
  expect(onLocationConnected).not.toHaveBeenCalled();
}

function expectNoHighLevelCall() {
  expect(store.readAgencyAccessToken).not.toHaveBeenCalled();
  expect(reconcile.listInstalledLocations).not.toHaveBeenCalled();
  expectNothingCreated();
}

describe("INSTALL without companyId", () => {
  it("one agency that lists it: lists once, then mints, saves and runs the hook", async () => {
    const response = await handleWebhook(signed(future), deps);
    expect(response.status).toBe(200);
    expect(reconcile.listInstalledLocations).toHaveBeenCalledTimes(1);
    expect(reconcile.listInstalledLocations).toHaveBeenCalledWith("token-agency_a", "agency_a");
    expect(client.mintLocationToken).toHaveBeenCalledWith("token-agency_a", "agency_a", "loc_new");
    expect(store.saveLocationConnection).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: "loc_new", companyId: "agency_a", accessToken: "loc-access", listedAt: NOW }),
    );
    expect(onLocationConnected).toHaveBeenCalledWith({
      tenantId: "t1",
      companyId: "agency_a",
      locationId: "loc_new",
      accessToken: "loc-access",
    });
    expect(store.markProcessed).toHaveBeenCalledWith("wh_future", NOW);
  });

  it("one agency that does not list it: answers 500 so HighLevel retries, creates nothing", async () => {
    reconcile.listInstalledLocations.mockResolvedValueOnce(listedElsewhere);
    expect((await handleWebhook(signed(future), deps)).status).toBe(500);
    expectNothingCreated();
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it("no agency: reason code without ids, 200, no HighLevel call", async () => {
    lookup.listAgencyCompanyIds.mockResolvedValueOnce([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await handleWebhook(signed(future), deps)).status).toBe(200);
    expectNoHighLevelCall();
    expect(store.markProcessed).toHaveBeenCalledWith("wh_future", NOW);
    expect(JSON.stringify(warn.mock.calls)).toContain("install_no_agency");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("loc_new");
  });

  it("two agencies: reason code without ids, 200, no HighLevel call", async () => {
    lookup.listAgencyCompanyIds.mockResolvedValueOnce(["agency_a", "agency_b"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await handleWebhook(signed(future), deps)).status).toBe(200);
    expectNoHighLevelCall();
    expect(store.markProcessed).toHaveBeenCalledWith("wh_future", NOW);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("install_multiple_agencies");
    for (const id of ["loc_new", "agency_a", "agency_b"]) expect(logged).not.toContain(id);
  });

  it("replay on a connected tenant: 200 and no HighLevel call, token write or hook", async () => {
    lookup.findTenant.mockResolvedValueOnce({ tenantId: "t1", companyId: "agency_a", status: "connected" });
    expect((await handleWebhook(signed(future), deps)).status).toBe(200);
    expectNoHighLevelCall();
    expect(store.markProcessed).toHaveBeenCalledWith("wh_future", NOW);
  });

  it("an uninstalled tenant the agency lists again is a genuine reinstall", async () => {
    lookup.findTenant.mockResolvedValueOnce({ tenantId: "t1", companyId: "agency_a", status: "uninstalled" });
    expect((await handleWebhook(signed(future), deps)).status).toBe(200);
    expect(store.saveLocationConnection).toHaveBeenCalledTimes(1);
  });

  it("an uninstalled tenant the agency does not list is not revived: 500", async () => {
    lookup.findTenant.mockResolvedValueOnce({ tenantId: "t1", companyId: "agency_a", status: "uninstalled" });
    reconcile.listInstalledLocations.mockResolvedValueOnce(listedElsewhere);
    expect((await handleWebhook(signed(future), deps)).status).toBe(500);
    expectNothingCreated();
  });

  it("a tenant stored under another agency: 500 before any token, list or mint", async () => {
    lookup.findTenant.mockResolvedValueOnce({ tenantId: "t1", companyId: "agency_z", status: "uninstalled" });
    expect((await handleWebhook(signed(future), deps)).status).toBe(500);
    expectNoHighLevelCall();
  });

  it("a failed list: 500, creates nothing", async () => {
    reconcile.listInstalledLocations.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handleWebhook(signed(future), deps)).status).toBe(500);
    expectNothingCreated();
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it("no usable token: 500, no list", async () => {
    store.readAgencyAccessToken.mockResolvedValueOnce(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handleWebhook(signed(future), deps)).status).toBe(500);
    expect(reconcile.listInstalledLocations).not.toHaveBeenCalled();
    expectNothingCreated();
  });

  it("the stored agencies cannot be read: 500", async () => {
    lookup.listAgencyCompanyIds.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handleWebhook(signed(future), deps)).status).toBe(500);
    expectNoHighLevelCall();
  });

  it("the save guard's refusal answers 500 and runs no hook", async () => {
    store.saveLocationConnection.mockRejectedValueOnce(new Error("Location already belongs to a different agency."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handleWebhook(signed(future), deps)).status).toBe(500);
    expect(onLocationConnected).not.toHaveBeenCalled();
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it("a replay of a processed event does nothing", async () => {
    store.begin.mockResolvedValueOnce("duplicate");
    expect((await handleWebhook(signed(future), deps)).status).toBe(200);
    expect(lookup.listAgencyCompanyIds).not.toHaveBeenCalled();
    expectNoHighLevelCall();
  });

  it("without the lookup wired, it is stored and acknowledged as before", async () => {
    expect((await handleWebhook(signed(future), { ...deps, companylessInstall: undefined })).status).toBe(200);
    expectNoHighLevelCall();
  });
});

describe("other INSTALL shapes are unchanged", () => {
  it("with companyId: uses that agency, no lookup, no listedAt", async () => {
    const response = await handleWebhook(signed({ ...future, companyId: "agency_a" }), deps);
    expect(response.status).toBe(200);
    expect(lookup.listAgencyCompanyIds).not.toHaveBeenCalled();
    expect(lookup.findTenant).not.toHaveBeenCalled();
    expect(reconcile.listInstalledLocations).toHaveBeenCalledWith("token-agency_a", "agency_a");
    const saved = store.saveLocationConnection.mock.calls[0][0];
    expect(saved.companyId).toBe("agency_a");
    expect("listedAt" in saved).toBe(false);
  });

  it("with a companyId whose list lacks the location: 500", async () => {
    reconcile.listInstalledLocations.mockResolvedValueOnce(listedElsewhere);
    expect((await handleWebhook(signed({ ...future, companyId: "agency_b" }), deps)).status).toBe(500);
    expect(lookup.listAgencyCompanyIds).not.toHaveBeenCalled();
    expectNothingCreated();
  });

  it("Company-level (no locationId): stored and acknowledged, no lookup", async () => {
    const response = await handleWebhook(
      signed({ type: "INSTALL", appId: APP_ID, companyId: "agency_a", webhookId: "wh_company" }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(lookup.listAgencyCompanyIds).not.toHaveBeenCalled();
    expectNoHighLevelCall();
  });
});
