import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { handleWebhook } from "@/features/highlevel";
import type { WebhookDeps } from "@/features/highlevel";

// Reconcile: a signed event is confirmed against HighLevel's own list of installed locations before
// it changes anything that matters (closes gaps a and e of ticket 4 in PROGRESS.md).
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const NOW = new Date("2026-11-21T10:00:00.000Z");
const APP_ID = "app-1";

function signed(body: unknown): Request {
  const raw = JSON.stringify(body);
  return new Request("https://app.example.test/api/integrations/webhooks", {
    method: "POST",
    body: raw,
    headers: { "x-ghl-signature": sign(null, Buffer.from(raw), privateKey).toString("base64") },
  });
}

const install = { type: "INSTALL", appId: APP_ID, locationId: "loc_1", companyId: "company_1" };
const uninstallLocation = { type: "UNINSTALL", appId: APP_ID, locationId: "loc_1" };
const uninstallLocationWithCompany = { ...uninstallLocation, companyId: "company_1" };
const uninstallAgency = { type: "UNINSTALL", appId: APP_ID, companyId: "company_1" };

let store: WebhookDeps["store"] & {
  markLocationUninstalled: ReturnType<typeof vi.fn>;
  saveLocationConnection: ReturnType<typeof vi.fn>;
  markProcessed: ReturnType<typeof vi.fn>;
  readAgencyAccessToken: ReturnType<typeof vi.fn>;
  deleteAgencyConnection: ReturnType<typeof vi.fn>;
};
let client: { mintLocationToken: Mock<WebhookDeps["client"]["mintLocationToken"]> };
type Reconcile = NonNullable<WebhookDeps["reconcile"]>;
let reconcile: { [K in keyof Reconcile]: Mock<Reconcile[K]> };
let deps: WebhookDeps;
let installed: { locationId: string; name: string | null }[];

beforeEach(() => {
  installed = [{ locationId: "loc_1", name: "JCR" }];
  store = {
    begin: vi.fn(async () => "process" as const),
    markProcessed: vi.fn(async () => {}),
    readAgencyAccessToken: vi.fn(async () => "agency-access"),
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
    listInstalledLocations: vi.fn(async () => installed),
    readLocationCompanyId: vi.fn(async () => "company_1"),
  };
  deps = { appId: APP_ID, publicKeyPem, now: () => NOW, newId: () => "generated-1", store, client, reconcile };
});

describe("webhook reconcile: INSTALL", () => {
  it("mints and saves when HighLevel lists the location", async () => {
    expect((await handleWebhook(signed(install), deps)).status).toBe(200);
    expect(reconcile.listInstalledLocations).toHaveBeenCalledWith("agency-access", "company_1");
    expect(client.mintLocationToken).toHaveBeenCalledTimes(1);
    expect(store.saveLocationConnection).toHaveBeenCalledTimes(1);
  });

  it("answers 500 (HighLevel retries) and creates nothing when the location is not listed", async () => {
    installed = [{ locationId: "loc_OTHER", name: null }];
    const response = await handleWebhook(signed(install), deps);
    expect(response.status).toBe(500);
    expect(client.mintLocationToken).not.toHaveBeenCalled();
    expect(store.saveLocationConnection).not.toHaveBeenCalled();
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it("answers 500 when listing fails", async () => {
    reconcile.listInstalledLocations.mockRejectedValueOnce(new Error("down"));
    expect((await handleWebhook(signed(install), deps)).status).toBe(500);
    expect(client.mintLocationToken).not.toHaveBeenCalled();
  });

  it("still answers 500 with no agency token, before listing anything", async () => {
    store.readAgencyAccessToken.mockResolvedValueOnce(null);
    expect((await handleWebhook(signed(install), deps)).status).toBe(500);
    expect(reconcile.listInstalledLocations).not.toHaveBeenCalled();
  });
});

describe("webhook reconcile: UNINSTALL of one location", () => {
  it("acts when HighLevel no longer lists the location", async () => {
    installed = [];
    expect((await handleWebhook(signed(uninstallLocationWithCompany), deps)).status).toBe(200);
    expect(store.markLocationUninstalled).toHaveBeenCalledWith("loc_1", NOW);
  });

  it("ignores a replay: the location is still listed, so nothing is switched off, and it is acknowledged", async () => {
    const response = await handleWebhook(signed(uninstallLocationWithCompany), deps);
    expect(response.status).toBe(200);
    expect(store.markLocationUninstalled).not.toHaveBeenCalled();
    expect(store.markProcessed).toHaveBeenCalledTimes(1);
  });

  it("finds the company from the tenant when the payload has none (the documented schema has none)", async () => {
    installed = [];
    await handleWebhook(signed(uninstallLocation), deps);
    expect(reconcile.readLocationCompanyId).toHaveBeenCalledWith("loc_1");
    expect(store.readAgencyAccessToken).toHaveBeenCalledWith("company_1", NOW);
    expect(store.markLocationUninstalled).toHaveBeenCalledTimes(1);
  });

  it("the stored company wins over the payload's; the payload's is the fallback for an unknown tenant", async () => {
    installed = [];
    reconcile.readLocationCompanyId.mockResolvedValueOnce("company_STORED");
    await handleWebhook(signed({ ...uninstallLocation, companyId: "company_PAYLOAD" }), deps);
    expect(store.readAgencyAccessToken).toHaveBeenLastCalledWith("company_STORED", NOW);

    reconcile.readLocationCompanyId.mockResolvedValueOnce(null);
    await handleWebhook(signed({ ...uninstallLocation, companyId: "company_PAYLOAD" }), deps);
    expect(store.readAgencyAccessToken).toHaveBeenLastCalledWith("company_PAYLOAD", NOW);
  });

  it("acts without confirming when it cannot be checked: unknown company or no agency token", async () => {
    reconcile.readLocationCompanyId.mockResolvedValueOnce(null);
    await handleWebhook(signed(uninstallLocation), deps);
    expect(reconcile.listInstalledLocations).not.toHaveBeenCalled();
    expect(store.markLocationUninstalled).toHaveBeenCalledTimes(1);

    store.markLocationUninstalled.mockClear();
    store.readAgencyAccessToken.mockResolvedValueOnce(null);
    await handleWebhook(signed(uninstallLocation), deps);
    expect(reconcile.listInstalledLocations).not.toHaveBeenCalled();
    expect(store.markLocationUninstalled).toHaveBeenCalledTimes(1);
    expect(store.readAgencyAccessToken).toHaveBeenCalledWith("company_1", NOW); // this time the company was known
  });

  it("acts when the list is not empty but does not contain the location", async () => {
    installed = [{ locationId: "loc_OTHER", name: null }, { locationId: "loc_THIRD", name: null }];
    expect((await handleWebhook(signed(uninstallLocationWithCompany), deps)).status).toBe(200);
    expect(reconcile.listInstalledLocations).toHaveBeenCalledTimes(1);
    expect(store.markLocationUninstalled).toHaveBeenCalledWith("loc_1", NOW);
  });

  it("answers 500 and changes nothing when HighLevel fails while checking", async () => {
    reconcile.listInstalledLocations.mockRejectedValueOnce(new Error("down"));
    expect((await handleWebhook(signed(uninstallLocationWithCompany), deps)).status).toBe(500);
    expect(store.markLocationUninstalled).not.toHaveBeenCalled();
  });
});

describe("webhook reconcile: other events", () => {
  it("an agency-level UNINSTALL still just deletes the agency token, with no listing", async () => {
    await handleWebhook(signed(uninstallAgency), deps);
    expect(store.deleteAgencyConnection).toHaveBeenCalledWith("company_1");
    expect(reconcile.listInstalledLocations).not.toHaveBeenCalled();
  });

  it("without reconcile INSTALL and UNINSTALL behave as before", async () => {
    const bare: WebhookDeps = { ...deps, reconcile: undefined };
    expect((await handleWebhook(signed(install), bare)).status).toBe(200);
    expect((await handleWebhook(signed(uninstallLocation), bare)).status).toBe(200);
    expect(store.markLocationUninstalled).toHaveBeenCalledTimes(1);
  });
});
