import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebhook, type WebhookDeps } from "@/features/highlevel";

// Hooks of the onboarding feature: INSTALL, LocationUpdate, UserCreate/Update/Delete. Unknown events
// are a no-op; a failing hook never turns into a retry storm for user and location events.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const APP = "app-1";
const NOW = new Date("2026-11-22T10:00:00.000Z");
const signed = (body: unknown) => {
  const raw = JSON.stringify(body);
  return new Request("https://app.example.test/w", { method: "POST", body: raw, headers: { "x-ghl-signature": sign(null, Buffer.from(raw), privateKey).toString("base64") } });
};

let hooks: Required<NonNullable<WebhookDeps["hooks"]>>;
let deps: WebhookDeps;
const store = () => ({
  begin: vi.fn(async () => "process" as const),
  markProcessed: vi.fn(async () => {}),
  readAgencyAccessToken: vi.fn(async () => "agency-access"),
  saveLocationConnection: vi.fn(async () => ({ tenantId: "t1" })),
  markLocationUninstalled: vi.fn(async () => {}),
  deleteAgencyConnection: vi.fn(async () => {}),
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  hooks = { onLocationConnected: vi.fn(async () => {}), onLocationUpdate: vi.fn(async () => {}), onUserEvent: vi.fn(async () => {}) };
  deps = {
    appId: APP, publicKeyPem, now: () => NOW, newId: () => "gen", store: store(), hooks,
    client: { mintLocationToken: vi.fn(async (_a: string, _c: string, locationId: string) => ({ accessToken: "la", refreshToken: "lr", expiresInSeconds: 86400, locationId })) },
  };
});

describe("INSTALL", () => {
  it("saves the location token, then runs onLocationConnected with the tenant and the token", async () => {
    const response = await handleWebhook(signed({ type: "INSTALL", appId: APP, locationId: "loc_1", companyId: "co_1" }), deps);
    expect(response.status).toBe(200);
    expect(deps.store.saveLocationConnection).toHaveBeenCalledTimes(1);
    expect(hooks.onLocationConnected).toHaveBeenCalledWith({ tenantId: "t1", companyId: "co_1", locationId: "loc_1", accessToken: "la" });
  });

  it("still answers 200 when the user creation hook fails (the sync repairs it)", async () => {
    (hooks.onLocationConnected as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("users down"));
    const response = await handleWebhook(signed({ type: "INSTALL", appId: APP, locationId: "loc_1", companyId: "co_1" }), deps);
    expect(response.status).toBe(200);
    expect(deps.store.markProcessed).toHaveBeenCalled();
  });
});

describe("UNINSTALL", () => {
  it("marks the tenant uninstalled (which deletes its tokens) and runs no user hook", async () => {
    await handleWebhook(signed({ type: "UNINSTALL", appId: APP, locationId: "loc_1" }), deps);
    expect(deps.store.markLocationUninstalled).toHaveBeenCalledWith("loc_1", NOW);
    expect(hooks.onUserEvent).not.toHaveBeenCalled();
  });
});

describe("LocationUpdate", () => {
  it("passes the location id from `id` and the new name", async () => {
    const response = await handleWebhook(signed({ type: "LocationUpdate", appId: APP, id: "loc_1", companyId: "co_1", name: "New Name" }), deps);
    expect(response.status).toBe(200);
    expect(hooks.onLocationUpdate).toHaveBeenCalledWith({ locationId: "loc_1", name: "New Name" });
  });

  it("answers 200 when the hook fails", async () => {
    (hooks.onLocationUpdate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db"));
    expect((await handleWebhook(signed({ type: "LocationUpdate", appId: APP, id: "loc_1" }), deps)).status).toBe(200);
  });
});

describe("user events", () => {
  it.each(["UserCreate", "UserUpdate", "UserDelete"])("%s triggers a user re-read for that location", async (type) => {
    const response = await handleWebhook(signed({ type, appId: APP, locationId: "loc_1", companyId: "co_1", id: "u1", email: "a@x.test" }), deps);
    expect(response.status).toBe(200);
    expect(hooks.onUserEvent).toHaveBeenCalledWith({ type, locationId: "loc_1" });
  });

  it("does nothing without a location id and still answers 200", async () => {
    expect((await handleWebhook(signed({ type: "UserCreate", appId: APP, id: "u1" }), deps)).status).toBe(200);
    expect(hooks.onUserEvent).not.toHaveBeenCalled();
  });

  it("answers 200 when the hook throws", async () => {
    (hooks.onUserEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("hl down"));
    expect((await handleWebhook(signed({ type: "UserCreate", appId: APP, locationId: "loc_1" }), deps)).status).toBe(200);
  });
});

describe("unknown events", () => {
  it("are stored and acknowledged, with no hook and no throw", async () => {
    const response = await handleWebhook(signed({ type: "SomethingNew", appId: APP, locationId: "loc_1" }), deps);
    expect(response.status).toBe(200);
    expect(deps.store.begin).toHaveBeenCalled();
    for (const hook of Object.values(hooks)) expect(hook).not.toHaveBeenCalled();
  });
});

describe("appId on events whose schema has none", () => {
  it.each(["LocationUpdate", "UserCreate", "UserUpdate", "UserDelete"])("%s without an appId is handled", async (type) => {
    const body = type === "LocationUpdate" ? { type, id: "loc_1", name: "N" } : { type, locationId: "loc_1" };
    expect((await handleWebhook(signed(body), deps)).status).toBe(200);
    expect(deps.store.begin).toHaveBeenCalled();
  });

  it.each(["LocationUpdate", "UserCreate"])("%s with ANOTHER app's id is still dropped", async (type) => {
    expect((await handleWebhook(signed({ type, appId: "other", locationId: "loc_1", id: "loc_1" }), deps)).status).toBe(200);
    expect(deps.store.begin).not.toHaveBeenCalled();
  });

  it("INSTALL and UNINSTALL still need the right appId", async () => {
    for (const type of ["INSTALL", "UNINSTALL"]) {
      await handleWebhook(signed({ type, locationId: "loc_1", companyId: "co_1" }), deps);
    }
    expect(deps.store.begin).not.toHaveBeenCalled();
  });
});
