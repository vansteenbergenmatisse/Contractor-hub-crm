import { beforeEach, describe, expect, it, vi } from "vitest";

const { readLocationState, updateLocationLocked, updateAgencyLocked } = vi.hoisted(() => ({
  readLocationState: vi.fn(),
  updateLocationLocked: vi.fn(),
  updateAgencyLocked: vi.fn(),
}));
vi.mock("../../../src/features/highlevel/db/token-store", () => ({
  readLocationState,
  readAgencyState: vi.fn(),
  updateLocationLocked,
  updateAgencyLocked,
}));
vi.mock("@/shared/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/config")>()),
  parseEnv: () => ({
    GHL_API_BASE_URL: "https://hl.example.test",
    GHL_APP_ID: "app",
    GHL_CLIENT_ID: "client",
    GHL_CLIENT_SECRET: "secret",
    GHL_REDIRECT_URI: "https://crm.example.test/cb",
    TOKEN_ENCRYPTION_KEY: "key",
  }),
}));

import { buildBrand, createBrandService, createSignInBrandLoader, toPublicSignInBrand } from "@/features/brand";
import { readTenantCustomValuesStored } from "@/features/highlevel";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const state = (over: Record<string, unknown> = {}) => ({
  tenantId: "t1",
  locationId: "loc",
  companyId: "co",
  status: "connected",
  accessToken: "stored-token",
  refreshToken: "refresh-token",
  expiresAt: new Date(NOW + 60 * 60 * 1000),
  ...over,
});
const hlBody = (name: string) => JSON.stringify({ customValues: [{ fieldKey: "{{ custom_values.business_name }}", value: name }] });

const fetchMock = vi.fn();

function setup(ttlMs = 1000) {
  let clock = NOW;
  const fetchValues = vi.fn(async () => [{ key: "business_name", value: "Signed In Read" }]);
  const service = createBrandService({
    fetchValues,
    readStoredValues: readTenantCustomValuesStored,
    now: () => clock,
    ttlMs,
  });
  const load = createSignInBrandLoader({
    findTenantId: async () => "t1",
    readValues: service.getValuesReadOnly,
    now: () => clock,
    hosts: [],
  });
  return { service, load, fetchValues, advance: (ms: number) => (clock += ms) };
}

const expectNoTokenChange = () => {
  expect(updateLocationLocked).not.toHaveBeenCalled();
  expect(updateAgencyLocked).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => new Response(hlBody("Stored Token Read"), { status: 200 }));
  readLocationState.mockResolvedValue(state());
});

describe("anonymous branding never touches a token", () => {
  it("reads custom values with a valid stored token, without locking", async () => {
    const { load, fetchValues } = setup();
    expect((await load("acme"))?.name).toBe("Stored Token Read");
    expect(fetchValues).not.toHaveBeenCalled();
    expectNoTokenChange();
  });

  it("an expired token causes no refresh, no write, no HighLevel call and the neutral page", async () => {
    readLocationState.mockResolvedValue(state({ expiresAt: new Date(NOW - 1000) }));
    const { load, fetchValues } = setup();
    expect(await load("acme")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fetchValues).not.toHaveBeenCalled();
    expectNoTokenChange();
  });

  it("a 401 marks nothing, does not retry, and gives the neutral page", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 401 }));
    const { load, fetchValues } = setup();
    expect(await load("acme")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchValues).not.toHaveBeenCalled();
    expectNoTokenChange();
  });

  it.each(["needs_reconnect", "uninstalled"])("a %s connection is not read", async (status) => {
    readLocationState.mockResolvedValue(state({ status }));
    const { load } = setup();
    expect(await load("acme")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a missing connection gives the neutral page", async () => {
    readLocationState.mockResolvedValue(null);
    const { load } = setup();
    expect(await load("acme")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows cached branding when the token has expired since", async () => {
    const { service, load, advance } = setup();
    await service.getValues("t1");
    advance(5000);
    readLocationState.mockResolvedValue(state({ expiresAt: new Date(NOW - 1000) }));
    expect((await load("acme"))?.name).toBe("Signed In Read");
    expectNoTokenChange();
  });

  it("an invalidated cache is not shown", async () => {
    const { service, load } = setup();
    await service.getValues("t1");
    service.invalidate("t1");
    readLocationState.mockResolvedValue(state({ expiresAt: new Date(NOW - 1000) }));
    expect(await load("acme")).toBeNull();
  });

  it("a signed-in read does not join a failing anonymous read", async () => {
    let finish: (value: unknown) => void = () => {};
    readLocationState.mockImplementationOnce(() => new Promise((done) => (finish = done)));
    const { service, fetchValues } = setup();
    const anonymous = service.getValuesReadOnly("t1").catch(() => "failed");
    await expect(service.getValues("t1")).resolves.toEqual([{ key: "business_name", value: "Signed In Read" }]);
    expect(fetchValues).toHaveBeenCalledTimes(1);
    finish(null);
    await anonymous;
  });
});

describe("publicName", () => {
  it.each([
    ["right-to-left override", "Acme‮gnifoor"],
    ["isolate", "Acme⁦x⁩"],
    ["zero-width joiner", "Ac‍me"],
    ["byte order mark", "﻿Acme"],
    ["soft hyphen", "Ac­me"],
  ])("strips %s", (_name, raw) => {
    const brand = toPublicSignInBrand(buildBrand([{ key: "business_name", value: raw }]), "acme", []);
    expect(brand?.name).not.toMatch(/\p{Cf}/u);
    expect(brand?.name).toContain("Ac");
  });

  it("a name of only format characters is no name", () => {
    expect(toPublicSignInBrand(buildBrand([{ key: "business_name", value: "‮‍" }]), "acme", [])).toBeNull();
  });
});
