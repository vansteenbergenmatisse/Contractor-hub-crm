import { afterEach, describe, expect, it, vi } from "vitest";
import { createTokenService, renewDueTokens, TokenServiceError } from "@/features/highlevel";
import type { TokenServiceDeps } from "@/features/highlevel";

const NOW = new Date("2026-11-22T12:00:00.000Z");
const HOUR = 3600_000;

function renewalDeps(overrides: Record<string, unknown> = {}) {
  return {
    now: () => NOW,
    listDueAgencies: vi.fn(async () => ["C1"]),
    listDueLocations: vi.fn(async () => ["T1", "T2"]),
    renewAgency: vi.fn(async () => true),
    renewLocation: vi.fn(async () => true),
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("renewDueTokens", () => {
  it("renews agencies before locations and reports counts", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const order: string[] = [];
    const deps = renewalDeps({
      renewAgency: vi.fn(async (id: string) => (order.push(id), true)),
      renewLocation: vi.fn(async (id: string) => (order.push(id), true)),
    });
    const summary = await renewDueTokens(deps, 6 * HOUR);
    expect(order).toEqual(["C1", "T1", "T2"]);
    expect(summary).toEqual({ due: 3, renewed: 3, unchanged: 0, failed: 0, skipped: 0 });
    expect(deps.listDueLocations.mock.calls[0]).toEqual([new Date(NOW.getTime() + 6 * HOUR), expect.any(Number)]);
  });

  it("keeps going after one client fails and logs no id", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = renewalDeps({
      renewLocation: vi.fn(async (id: string) => {
        if (id === "T1") throw new TokenServiceError("unavailable");
        return true;
      }),
    });
    const summary = await renewDueTokens(deps, HOUR);
    expect(summary).toMatchObject({ renewed: 2, failed: 1 });
    const logged = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
    expect(logged).not.toContain("T1");
    expect(logged).not.toContain("C1");
  });

  it("stops at its time budget and counts what it skipped", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    let tick = 0;
    const deps = renewalDeps({ now: () => new Date(NOW.getTime() + tick++ * 30_000) });
    const summary = await renewDueTokens(deps, HOUR);
    expect(summary.skipped).toBeGreaterThan(0);
    expect(summary.renewed + summary.skipped).toBe(3);
  });

  it("never throws when the list cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = renewalDeps({ listDueAgencies: vi.fn(async () => { throw new Error("db"); }) });
    await expect(renewDueTokens(deps, HOUR)).resolves.toMatchObject({ failed: 1, renewed: 0 });
  });
});

function tokenService(expiresInMs: number, status = "connected") {
  const location = {
    tenantId: "T1",
    locationId: "L1",
    companyId: "C1",
    status,
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: new Date(NOW.getTime() + expiresInMs),
  };
  const agency = { companyId: "C1", accessToken: "agency-old", refreshToken: "agency-refresh", expiresAt: new Date(NOW.getTime() + expiresInMs) };
  const refreshToken = vi.fn(async () => ({ accessToken: "new-access", refreshToken: "new-refresh", expiresInSeconds: 86400 }));
  const store = {
    readLocationState: vi.fn(async () => location),
    readAgencyState: vi.fn(async () => agency),
    updateLocationLocked: vi.fn(async (_id: string, decide: (state: typeof location) => Promise<{ kind: string; accessToken?: string }>) => {
      const decision = await decide(location);
      return decision.kind === "save" ? { ...location, accessToken: decision.accessToken as string } : location;
    }),
    updateAgencyLocked: vi.fn(async (_id: string, decide: (state: typeof agency) => Promise<{ kind: string; accessToken?: string }>) => {
      const decision = await decide(agency);
      return decision.kind === "save" ? { ...agency, accessToken: decision.accessToken as string } : agency;
    }),
  };
  const service = createTokenService({
    client: { refreshToken, mintLocationToken: vi.fn() },
    store,
    now: () => NOW,
  } as unknown as TokenServiceDeps);
  return { service, refreshToken, store };
}

describe("token service renewal", () => {
  it("renews a location token inside the window, well before the 5-minute rule", async () => {
    const { service, refreshToken } = tokenService(2 * HOUR);
    expect(await service.renewLocationToken("T1", 6 * HOUR)).toBe(true);
    expect(refreshToken).toHaveBeenCalledWith("old-refresh", "Location");
  });

  it("leaves a token outside the window alone", async () => {
    const { service, refreshToken, store } = tokenService(8 * HOUR);
    expect(await service.renewLocationToken("T1", 6 * HOUR)).toBe(false);
    expect(refreshToken).not.toHaveBeenCalled();
    expect(store.updateLocationLocked).not.toHaveBeenCalled();
  });

  it.each(["needs_reconnect", "uninstalled"])("does not touch a %s client", async (status) => {
    const { service, refreshToken } = tokenService(HOUR, status);
    expect(await service.renewLocationToken("T1", 6 * HOUR)).toBe(false);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it("does not rotate twice when another caller already replaced the token", async () => {
    const { service, refreshToken, store } = tokenService(2 * HOUR);
    const replaced = { ...(await store.readLocationState()), accessToken: "someone-elses-new-token" };
    store.updateLocationLocked.mockImplementationOnce(async (_id, decide) => {
      const decision = await decide(replaced);
      expect(decision.kind).toBe("keep");
      return replaced;
    });
    await service.renewLocationToken("T1", 6 * HOUR);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it("renews an agency token inside the window", async () => {
    const { service, refreshToken } = tokenService(2 * HOUR);
    expect(await service.renewAgencyToken("C1", 6 * HOUR)).toBe(true);
    expect(refreshToken).toHaveBeenCalledWith("agency-refresh", "Company");
  });
});
