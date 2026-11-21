import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { handleWebhook } from "@/features/highlevel";
import type { WebhookDeps } from "@/features/highlevel";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const NOW = new Date("2026-11-21T10:00:00.000Z");
const APP_ID = "app-1";

function signed(body: unknown, headers: Record<string, string> = {}): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://app.example.test/api/integrations/webhooks", {
    method: "POST",
    body: raw,
    headers: { "x-ghl-signature": sign(null, Buffer.from(raw), privateKey).toString("base64"), ...headers },
  });
}

type Store = WebhookDeps["store"];
let store: { [K in keyof Store]: Mock<Store[K]> };
let client: { mintLocationToken: Mock<WebhookDeps["client"]["mintLocationToken"]> };
let deps: WebhookDeps;
let order: string[];

beforeEach(() => {
  order = [];
  store = {
    begin: vi.fn(async () => {
      order.push("begin");
      return "process" as const;
    }),
    markProcessed: vi.fn(async () => {
      order.push("processed");
    }),
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
  deps = { appId: APP_ID, publicKeyPem, now: () => NOW, newId: () => "generated-1", store, client };
});

const install = { type: "INSTALL", appId: APP_ID, locationId: "loc_1", companyId: "company_1", webhookId: "wh_1" };
const uninstallLocation = { type: "UNINSTALL", appId: APP_ID, locationId: "loc_1" };
const uninstallAgency = { type: "UNINSTALL", appId: APP_ID, companyId: "company_1" };

describe("webhook: verification comes first", () => {
  it.each([
    ["no signature header", (b: string) => new Request("https://x.test/w", { method: "POST", body: b })],
    ["only the legacy header", (b: string) => new Request("https://x.test/w", { method: "POST", body: b, headers: { "x-wh-signature": "AAAA" } })],
    ["a bad signature", (b: string) => new Request("https://x.test/w", { method: "POST", body: b, headers: { "x-ghl-signature": Buffer.alloc(64, 1).toString("base64") } })],
  ])("answers 401 and touches nothing with %s", async (_label, make) => {
    const response = await handleWebhook(make(JSON.stringify(install)), deps);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
    expect(client.mintLocationToken).not.toHaveBeenCalled();
  });

  it("ignores a valid Ed25519 signature sent in the legacy header", async () => {
    const raw = JSON.stringify(install);
    const validSignature = sign(null, Buffer.from(raw), privateKey).toString("base64");
    const request = new Request("https://x.test/w", { method: "POST", body: raw, headers: { "x-wh-signature": validSignature } });
    expect((await handleWebhook(request, deps)).status).toBe(401);
    expect(store.begin).not.toHaveBeenCalled();
  });

  it("answers 401, not 400, for an unsigned body that is not JSON (verify before parse)", async () => {
    for (const body of ["not json", "[]", "null", "{"]) {
      const response = await handleWebhook(new Request("https://x.test/w", { method: "POST", body }), deps);
      expect(response.status).toBe(401);
    }
  });

  it("answers 401 for a header holding two signature values", async () => {
    const raw = JSON.stringify(install);
    const good = sign(null, Buffer.from(raw), privateKey).toString("base64");
    const headers = new Headers();
    headers.append("x-ghl-signature", good);
    headers.append("x-ghl-signature", good);
    expect((await handleWebhook(new Request("https://x.test/w", { method: "POST", body: raw, headers }), deps)).status).toBe(401);
  });

  it("accepts a signature over the re-serialized JSON at handler level", async () => {
    const spaced = `{ "type": "UNINSTALL", "appId": "${APP_ID}", "locationId": "loc_1" }`;
    const signature = sign(null, Buffer.from(JSON.stringify(JSON.parse(spaced))), privateKey).toString("base64");
    const request = new Request("https://x.test/w", { method: "POST", body: spaced, headers: { "x-ghl-signature": signature } });
    expect((await handleWebhook(request, deps)).status).toBe(200);
    expect(store.markLocationUninstalled).toHaveBeenCalledWith("loc_1", NOW);
  });

  it("rejects a body changed after signing", async () => {
    const request = signed(install);
    const tampered = new Request(request.url, {
      method: "POST",
      body: JSON.stringify({ ...install, locationId: "loc_other" }),
      headers: request.headers,
    });
    expect((await handleWebhook(tampered, deps)).status).toBe(401);
    expect(store.begin).not.toHaveBeenCalled();
  });

  it("answers 400 for a signed body that is not a JSON object with a type", async () => {
    for (const body of ["not json", "[]", "null", '{"appId":"app-1"}', '{"type":5,"appId":"app-1"}']) {
      const response = await handleWebhook(signed(body), deps);
      expect(response.status).toBe(400);
    }
    expect(store.begin).not.toHaveBeenCalled();
  });

  it("answers 413 for an unsigned body over 1 MB, before any signature check", async () => {
    const response = await handleWebhook(new Request("https://x.test/w", { method: "POST", body: "a".repeat(1_100_000) }), deps);
    expect(response.status).toBe(413);
  });

  it("answers 413 from a declared content-length over 1 MB alone", async () => {
    const request = new Request("https://x.test/w", { method: "POST", body: "{}", headers: { "content-length": "1000001" } });
    expect((await handleWebhook(request, deps)).status).toBe(413);
    expect(store.begin).not.toHaveBeenCalled();
  });

  it("counts bytes, not characters: a multibyte body over 1 MB is refused", async () => {
    const body = "é".repeat(600_000); // 600k characters, 1.2 MB
    expect((await handleWebhook(new Request("https://x.test/w", { method: "POST", body }), deps)).status).toBe(413);
  });

  it("answers 400, not 200, for a missing type even when the appId is foreign (pins the check order)", async () => {
    expect((await handleWebhook(signed({ appId: "other-app" }), deps)).status).toBe(400);
  });

  it("answers 413 for a body over 1 MB without verifying or storing", async () => {
    const big = JSON.stringify({ type: "X", appId: APP_ID, pad: "a".repeat(1_100_000) });
    const response = await handleWebhook(signed(big), deps);
    expect(response.status).toBe(413);
    expect(store.begin).not.toHaveBeenCalled();
  });
});

describe("webhook: appId", () => {
  it("acknowledges an event for another app with 200 and stores nothing", async () => {
    const response = await handleWebhook(signed({ ...install, appId: "other-app" }), deps);
    expect(response.status).toBe(200);
    expect(store.begin).not.toHaveBeenCalled();
    expect(client.mintLocationToken).not.toHaveBeenCalled();
  });

  it("treats a missing appId like another app", async () => {
    const noApp: Record<string, unknown> = { ...install };
    delete noApp.appId;
    expect((await handleWebhook(signed(noApp), deps)).status).toBe(200);
    expect(store.begin).not.toHaveBeenCalled();
  });
});

describe("webhook: idempotency", () => {
  it("records the event by its webhookId before acting, and marks it processed after", async () => {
    store.saveLocationConnection.mockImplementation(async () => {
      order.push("save");
      return { tenantId: "t1" };
    });
    const response = await handleWebhook(signed(install), deps);
    expect(response.status).toBe(200);
    expect(store.begin).toHaveBeenCalledWith({
      webhookId: "wh_1",
      type: "INSTALL",
      locationId: "loc_1",
      companyId: "company_1",
      payload: install,
    });
    expect(order).toEqual(["begin", "save", "processed"]);
    expect(store.markProcessed).toHaveBeenCalledWith("wh_1", NOW);
  });

  it("skips a duplicate: 200, no action", async () => {
    store.begin.mockResolvedValue("duplicate");
    const response = await handleWebhook(signed(install), deps);
    expect(response.status).toBe(200);
    expect(client.mintLocationToken).not.toHaveBeenCalled();
    expect(store.saveLocationConnection).not.toHaveBeenCalled();
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it("gives an event without a webhookId its own generated id, so a second UNINSTALL is not dropped", async () => {
    await handleWebhook(signed(uninstallLocation), deps);
    expect(store.begin).toHaveBeenCalledWith(expect.objectContaining({ webhookId: "generated:generated-1" }));
    expect(store.markLocationUninstalled).toHaveBeenCalledTimes(1);
  });

  it("ignores a webhookId that is not a non-empty string", async () => {
    await handleWebhook(signed({ ...uninstallLocation, webhookId: 7 }), deps);
    expect(store.begin).toHaveBeenCalledWith(expect.objectContaining({ webhookId: "generated:generated-1" }));
  });
});

describe("webhook: INSTALL", () => {
  it("mints a location token with the stored agency token and creates the tenant connection", async () => {
    await handleWebhook(signed(install), deps);
    expect(store.readAgencyAccessToken).toHaveBeenCalledWith("company_1", NOW);
    expect(client.mintLocationToken).toHaveBeenCalledWith("agency-access", "company_1", "loc_1");
    expect(store.saveLocationConnection).toHaveBeenCalledWith({
      locationId: "loc_1",
      companyId: "company_1",
      name: null,
      accessToken: "loc-access",
      refreshToken: "loc-refresh",
      expiresAt: new Date(NOW.getTime() + 86400 * 1000),
    });
  });

  it("answers 500 and leaves the event unprocessed when there is no usable agency token", async () => {
    store.readAgencyAccessToken.mockResolvedValue(null);
    const response = await handleWebhook(signed(install), deps);
    expect(response.status).toBe(500);
    expect(client.mintLocationToken).not.toHaveBeenCalled();
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it("answers 500 when minting or saving fails, so HighLevel retries", async () => {
    client.mintLocationToken.mockRejectedValueOnce(new Error("HighLevel location token failed (status 403)."));
    expect((await handleWebhook(signed(install), deps)).status).toBe(500);
    store.saveLocationConnection.mockRejectedValueOnce(new Error("db down"));
    expect((await handleWebhook(signed(install), deps)).status).toBe(500);
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it("stores an agency-level INSTALL without acting on it", async () => {
    const response = await handleWebhook(signed({ type: "INSTALL", appId: APP_ID, companyId: "company_1", webhookId: "wh_a" }), deps);
    expect(response.status).toBe(200);
    expect(client.mintLocationToken).not.toHaveBeenCalled();
    expect(store.markProcessed).toHaveBeenCalledWith("wh_a", NOW);
  });

  it("stores and acknowledges a location INSTALL that carries no companyId, without a token call", async () => {
    const response = await handleWebhook(signed({ type: "INSTALL", appId: APP_ID, locationId: "loc_1", webhookId: "wh_b" }), deps);
    expect(response.status).toBe(200);
    expect(client.mintLocationToken).not.toHaveBeenCalled();
    expect(store.saveLocationConnection).not.toHaveBeenCalled();
    expect(store.markProcessed).toHaveBeenCalledWith("wh_b", NOW);
  });
});

describe("webhook: UNINSTALL", () => {
  it("marks the location uninstalled and removes only its tokens", async () => {
    await handleWebhook(signed(uninstallLocation), deps);
    expect(store.markLocationUninstalled).toHaveBeenCalledWith("loc_1", NOW);
    expect(store.deleteAgencyConnection).not.toHaveBeenCalled();
  });

  it("deletes the agency token on an agency-level UNINSTALL", async () => {
    await handleWebhook(signed(uninstallAgency), deps);
    expect(store.deleteAgencyConnection).toHaveBeenCalledWith("company_1");
    expect(store.markLocationUninstalled).not.toHaveBeenCalled();
  });

  it("prefers the location when both ids are present", async () => {
    await handleWebhook(signed({ ...uninstallLocation, companyId: "company_1" }), deps);
    expect(store.markLocationUninstalled).toHaveBeenCalledTimes(1);
    expect(store.deleteAgencyConnection).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails, and does not mark it processed", async () => {
    store.markLocationUninstalled.mockRejectedValueOnce(new Error("db down"));
    const response = await handleWebhook(signed(uninstallLocation), deps);
    expect(response.status).toBe(500);
    expect(store.markProcessed).not.toHaveBeenCalled();
  });
});

describe("webhook: other events and hygiene", () => {
  it("stores any other event type and acknowledges it", async () => {
    const response = await handleWebhook(signed({ type: "ContactCreate", appId: APP_ID, locationId: "loc_1", webhookId: "wh_c" }), deps);
    expect(response.status).toBe(200);
    expect(store.begin).toHaveBeenCalledWith(expect.objectContaining({ type: "ContactCreate", webhookId: "wh_c" }));
    expect(store.markProcessed).toHaveBeenCalled();
    expect(store.markLocationUninstalled).not.toHaveBeenCalled();
  });

  it("never returns a body, a token or an error message, and logs the error type only", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.readAgencyAccessToken.mockRejectedValue(new Error("leak agency-access wh_1 company_1"));
    const response = await handleWebhook(signed(install), deps);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
    const logged = JSON.stringify(spy.mock.calls);
    for (const secret of ["leak", "agency-access", "wh_1", "company_1"]) expect(logged).not.toContain(secret);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("answers 500 when the first database call fails", async () => {
    store.begin.mockRejectedValue(new Error("db down"));
    expect((await handleWebhook(signed(install), deps)).status).toBe(500);
  });

  it("sends no-store on every answer", async () => {
    const response = await handleWebhook(signed(install), deps);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
