import { afterEach, describe, expect, it, vi } from "vitest";
import { createTokenService, renewDueTokens } from "@/features/highlevel";
import type { TokenServiceDeps } from "@/features/highlevel";

const NOW = new Date("2026-11-22T12:00:00.000Z");

function service(claimForcedRefresh?: (tenantId: string) => Promise<boolean>) {
  const location = {
    tenantId: "T1",
    locationId: "L1",
    companyId: "C1",
    status: "connected",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: new Date(NOW.getTime() + 3600_000),
  };
  const refreshToken = vi.fn(async () => ({ accessToken: "new-access", refreshToken: "new-refresh", expiresInSeconds: 86400 }));
  const updateLocationLocked = vi.fn(async (_id: string, decide: (state: typeof location) => Promise<{ kind: string; accessToken?: string }>) => {
    const decision = await decide(location);
    return decision.kind === "save" ? { ...location, accessToken: decision.accessToken as string } : location;
  });
  const tokens = createTokenService({
    client: { refreshToken, mintLocationToken: vi.fn() },
    store: { readLocationState: vi.fn(async () => location), readAgencyState: vi.fn(), updateLocationLocked, updateAgencyLocked: vi.fn() },
    now: () => NOW,
    claimForcedRefresh,
  } as unknown as TokenServiceDeps);
  return { tokens, refreshToken, updateLocationLocked };
}

afterEach(() => vi.restoreAllMocks());

describe("a 401 from HighLevel", () => {
  it("rotates the token once when the claim is won, then retries", async () => {
    const claim = vi.fn(async () => true);
    const { tokens, refreshToken } = service(claim);
    const call = vi.fn(async (token: string) => new Response("", { status: token === "new-access" ? 200 : 401 }));
    expect((await tokens.withLocationToken("T1", call)).status).toBe(200);
    expect(claim).toHaveBeenCalledWith("T1");
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it("hands the 401 back with no rotation or transaction when the claim is lost", async () => {
    const { tokens, refreshToken, updateLocationLocked } = service(async () => false);
    const call = vi.fn(async () => new Response("", { status: 401 }));
    expect((await tokens.withLocationToken("T1", call)).status).toBe(401);
    expect(call).toHaveBeenCalledTimes(1);
    expect(refreshToken).not.toHaveBeenCalled();
    expect(updateLocationLocked).not.toHaveBeenCalled();
  });

  it("fails closed when the claim cannot be made", async () => {
    const { tokens, refreshToken } = service(async () => {
      throw new Error("db");
    });
    const call = vi.fn(async () => new Response("", { status: 401 }));
    expect((await tokens.withLocationToken("T1", call)).status).toBe(401);
    expect(refreshToken).not.toHaveBeenCalled();
  });
});

describe("renewDueTokens fairness", () => {
  it("starts the location list at the chosen offset, after the agencies", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const order: string[] = [];
    await renewDueTokens(
      {
        now: () => NOW,
        listDueAgencies: async () => ["C1"],
        listDueLocations: async () => ["T1", "T2", "T3"],
        renewAgency: async (id) => (order.push(id), true),
        renewLocation: async (id) => (order.push(id), true),
        startOffset: () => 2,
      },
      3600_000,
    );
    expect(order).toEqual(["C1", "T3", "T1", "T2"]);
  });
});
