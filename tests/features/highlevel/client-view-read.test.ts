import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// While an admin views a client, a read must leave the client's connection untouched: no refresh,
// no mint, no store write, and no use of the client's own read quota.
const store = vi.hoisted(() => ({
  readLocationState: vi.fn(),
  updateLocationLocked: vi.fn(),
  updateAgencyLocked: vi.fn(),
}));

vi.mock("@/features/highlevel/db/token-store", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...store,
}));

import { createBrandService } from "@/features/brand";
import { createTenantContactsReader, TokenServiceError, withStoredLocationToken } from "@/features/highlevel";

const state = (overrides: Record<string, unknown> = {}) => ({
  tenantId: "T1",
  locationId: "L1",
  companyId: "C1",
  status: "connected",
  accessToken: "stored-token",
  refreshToken: "refresh-token",
  expiresAt: new Date(Date.now() + 3600_000),
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv("GHL_APP_ID", "app");
  vi.stubEnv("GHL_CLIENT_ID", "client");
  vi.stubEnv("GHL_CLIENT_SECRET", "secret");
  vi.stubEnv("GHL_APP_SHARED_SECRET", "shared");
  vi.stubEnv("GHL_REDIRECT_URI", "https://crm.example.test/callback");
  vi.stubEnv("GHL_API_BASE_URL", "https://api.example.test");
  vi.stubEnv("GHL_INSTALL_BASE_URL", "https://install.example.test");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  store.readLocationState.mockReset();
  store.updateLocationLocked.mockReset();
  store.updateAgencyLocked.mockReset();
});

describe("withStoredLocationToken", () => {
  it("calls with the stored token and writes nothing", async () => {
    store.readLocationState.mockResolvedValue(state());
    const call = vi.fn(async () => new Response("{}"));
    await withStoredLocationToken("T1", call);
    expect(call).toHaveBeenCalledWith("stored-token");
    expect(store.updateLocationLocked).not.toHaveBeenCalled();
    expect(store.updateAgencyLocked).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["expired", state({ expiresAt: new Date(Date.now() - 1000) })],
    ["needing a reconnect", state({ status: "needs_reconnect" })],
    ["uninstalled", state({ status: "uninstalled" })],
  ])("refuses a %s connection without calling or writing", async (_label, value) => {
    store.readLocationState.mockResolvedValue(value);
    const call = vi.fn(async () => new Response("{}"));
    await expect(withStoredLocationToken("T1", call)).rejects.toBeInstanceOf(TokenServiceError);
    expect(call).not.toHaveBeenCalled();
    expect(store.updateLocationLocked).not.toHaveBeenCalled();
  });

  it("does not refresh after a 401", async () => {
    store.readLocationState.mockResolvedValue(state());
    const call = vi.fn(async () => new Response("", { status: 401 }));
    expect((await withStoredLocationToken("T1", call)).status).toBe(401);
    expect(call).toHaveBeenCalledTimes(1);
    expect(store.updateLocationLocked).not.toHaveBeenCalled();
  });
});

describe("createTenantContactsReader for a viewer", () => {
  it("uses the viewer's quota and never refreshes an expired token", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    store.readLocationState.mockResolvedValue(state({ expiresAt: new Date(Date.now() - 1000) }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const hit = vi.fn<(key: string) => Promise<boolean>>(async () => true);
    const answer = await createTenantContactsReader(hit, { viewerId: "a1" })("T1");
    expect(answer).toEqual({ ok: false, reason: "unavailable" });
    expect(hit.mock.calls[0][0]).toBe("highlevel-contacts-view:a1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.updateLocationLocked).not.toHaveBeenCalled();
  });

  it("keeps the tenant's key for a normal read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hit = vi.fn<(key: string) => Promise<boolean>>(async () => false);
    await createTenantContactsReader(hit)("T1");
    expect(hit.mock.calls[0][0]).toBe("highlevel-contacts:T1");
  });
});

describe("brand service read-only brand", () => {
  it("builds the brand from stored-token values and never calls the refreshing read", async () => {
    const fetchValues = vi.fn(async () => []);
    const readStoredValues = vi.fn(async () => [{ key: "business_name", value: "Test Co" }]);
    const service = createBrandService({ fetchValues, readStoredValues, now: () => 0, ttlMs: 1000 });
    const brand = await service.getBrandReadOnly("T1");
    expect(readStoredValues).toHaveBeenCalledWith("T1");
    expect(fetchValues).not.toHaveBeenCalled();
    expect(brand).toBeDefined();
  });

  it("falls back to the empty brand when nothing can be read", async () => {
    const fetchValues = vi.fn(async () => []);
    const service = createBrandService({ fetchValues, readStoredValues: async () => null, now: () => 0, ttlMs: 1000 });
    expect((await service.getBrandReadOnly("T1")).businessName ?? null).toBeNull();
    expect(fetchValues).not.toHaveBeenCalled();
  });
});
