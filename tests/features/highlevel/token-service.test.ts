import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  createTokenService,
  HighLevelHttpError,
  TokenServiceError,
  type TokenServiceDeps,
  type AgencyDecision,
  type AgencyState,
  type LocationDecision,
  type LocationState,
} from "@/features/highlevel";

const NOW = new Date("2026-11-21T10:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const HOUR = 60;

// In-memory store with a real mutex per row: it behaves like the FOR UPDATE lock, so the concurrency
// tests mean something. decide runs on the state as it is when the lock is taken.
function memoryStore(initial: { location: LocationState | null; agency: AgencyState | null }) {
  const data = { location: initial.location, agency: initial.agency };
  // Is a location row lock held right now? Agency work while it is would risk pool starvation.
  const held = { location: false, agencyCallsWhileLocationHeld: 0 };
  const chains = new Map<string, Promise<unknown>>();
  const serial = <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const run = (chains.get(name) ?? Promise.resolve()).then(work, work);
    chains.set(name, run.catch(() => {}));
    return run;
  };
  return {
    data,
    held,
    readLocationState: vi.fn(async () => (data.location ? { ...data.location } : null)),
    readAgencyState: vi.fn(async () => {
      if (held.location) held.agencyCallsWhileLocationHeld += 1;
      return data.agency ? { ...data.agency } : null;
    }),
    updateLocationLocked: vi.fn((_tenantId: string, decide: (s: LocationState) => Promise<LocationDecision>) =>
      serial("location", async () => {
        if (!data.location) return null;
        held.location = true;
        let decision: LocationDecision;
        try {
          decision = await decide({ ...data.location });
        } finally {
          held.location = false;
        }
        if (decision.kind === "save") {
          data.location = {
            ...data.location,
            accessToken: decision.accessToken,
            refreshToken: decision.refreshToken === undefined ? data.location.refreshToken : decision.refreshToken,
            expiresAt: decision.expiresAt,
          };
        } else if (decision.kind === "reconnect") {
          data.location = { ...data.location, status: "needs_reconnect" };
        }
        return { ...data.location };
      }),
    ),
    updateAgencyLocked: vi.fn((_companyId: string, decide: (s: AgencyState) => Promise<AgencyDecision>) =>
      serial("agency", async () => {
        if (!data.agency) return null;
        if (held.location) held.agencyCallsWhileLocationHeld += 1;
        const decision = await decide({ ...data.agency });
        if (decision.kind === "save") {
          data.agency = {
            ...data.agency,
            accessToken: decision.accessToken,
            refreshToken: decision.refreshToken,
            expiresAt: decision.expiresAt,
          };
        }
        return { ...data.agency };
      }),
    ),
  };
}

const location = (over: Partial<LocationState> = {}): LocationState => ({
  tenantId: "tenant_1",
  locationId: "loc_1",
  companyId: "company_1",
  status: "connected",
  accessToken: "loc-access-1",
  refreshToken: "loc-refresh-1",
  expiresAt: minutes(HOUR),
  ...over,
});
const agency = (over: Partial<AgencyState> = {}): AgencyState => ({
  companyId: "company_1",
  accessToken: "agency-access-1",
  refreshToken: "agency-refresh-1",
  expiresAt: minutes(HOUR),
  ...over,
});

const refreshed = (n: number) => ({ accessToken: `new-access-${n}`, refreshToken: `new-refresh-${n}`, expiresInSeconds: 86_400 });
const rejected = () => new HighLevelHttpError("HighLevel token refresh failed (status 400).", 400);
const transient = () => new HighLevelHttpError("HighLevel token refresh failed (status 503).", 503);

type Client = TokenServiceDeps["client"];
let client: { [K in keyof Client]: Mock<Client[K]> };

beforeEach(() => {
  let n = 0;
  client = {
    refreshToken: vi.fn(async () => refreshed(++n)),
    mintLocationToken: vi.fn(async (_a: string, _c: string, locationId: string) => ({
      accessToken: "minted-access",
      refreshToken: "minted-refresh",
      expiresInSeconds: 86_400,
      locationId,
    })),
  };
});

function service(store: ReturnType<typeof memoryStore>) {
  return createTokenService({ client, store, now: () => NOW });
}

describe("token service: getLocationToken, fresh token", () => {
  it("returns the stored token without locking or calling HighLevel when over 5 minutes are left", async () => {
    const store = memoryStore({ location: location({ expiresAt: minutes(6) }), agency: agency() });
    expect(await service(store).getLocationToken("tenant_1")).toBe("loc-access-1");
    expect(store.updateLocationLocked).not.toHaveBeenCalled();
    expect(client.refreshToken).not.toHaveBeenCalled();
  });

  it("refreshes when LESS than 5 minutes are left; exactly 5 is still fresh", async () => {
    for (const [left, expectRefresh] of [[5, false], [4.9, true], [5.1, false]] as const) {
      const store = memoryStore({ location: location({ expiresAt: minutes(left) }), agency: agency() });
      client.refreshToken.mockClear();
      await service(store).getLocationToken("tenant_1");
      expect(client.refreshToken).toHaveBeenCalledTimes(expectRefresh ? 1 : 0);
    }
  });

  it("refuses an unknown tenant and an uninstalled tenant as not_connected", async () => {
    await expect(service(memoryStore({ location: null, agency: null })).getLocationToken("t")).rejects.toMatchObject({ code: "not_connected" });
    const store = memoryStore({ location: location({ status: "uninstalled" }), agency: agency() });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "not_connected" });
    expect(client.refreshToken).not.toHaveBeenCalled();
  });

  it("refuses a needs_reconnect tenant without calling HighLevel", async () => {
    const store = memoryStore({ location: location({ status: "needs_reconnect" }), agency: agency() });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "needs_reconnect" });
    expect(client.refreshToken).not.toHaveBeenCalled();
    expect(client.mintLocationToken).not.toHaveBeenCalled();
  });
});

describe("token service: getLocationToken, refresh", () => {
  it("refreshes a stale token with the stored refresh token, stores the rotated pair, returns the new token", async () => {
    const store = memoryStore({ location: location({ expiresAt: minutes(2) }), agency: agency() });
    expect(await service(store).getLocationToken("tenant_1")).toBe("new-access-1");
    expect(client.refreshToken).toHaveBeenCalledWith("loc-refresh-1", "Location");
    expect(store.data.location).toMatchObject({
      accessToken: "new-access-1",
      refreshToken: "new-refresh-1",
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    });
  });

  it("keeps the stored refresh token when the refresh response carries none", async () => {
    client.refreshToken.mockResolvedValueOnce({ accessToken: "a", refreshToken: null, expiresInSeconds: 100 });
    const store = memoryStore({ location: location({ expiresAt: minutes(1) }), agency: agency() });
    await service(store).getLocationToken("tenant_1");
    expect(store.data.location?.refreshToken).toBe("loc-refresh-1");
  });

  it("computes expiry from expires_in, not a constant", async () => {
    client.refreshToken.mockResolvedValueOnce({ accessToken: "a", refreshToken: "r", expiresInSeconds: 86_399 });
    const store = memoryStore({ location: location({ expiresAt: minutes(1) }), agency: agency() });
    await service(store).getLocationToken("tenant_1");
    expect(store.data.location?.expiresAt).toEqual(new Date(NOW.getTime() + 86_399_000));
  });

  it("two simultaneous callers with a stale token cause one refresh and get the same token", async () => {
    const store = memoryStore({ location: location({ expiresAt: minutes(1) }), agency: agency() });
    const svc = service(store);
    const tokens = await Promise.all([svc.getLocationToken("tenant_1"), svc.getLocationToken("tenant_1"), svc.getLocationToken("tenant_1")]);
    expect(tokens).toEqual(["new-access-1", "new-access-1", "new-access-1"]);
    expect(client.refreshToken).toHaveBeenCalledTimes(1);
  });

  it("a transient refresh failure (5xx, network, 429) changes nothing and reports unavailable", async () => {
    for (const error of [transient(), new HighLevelHttpError("net", null), new HighLevelHttpError("rate", 429)]) {
      client.refreshToken.mockRejectedValueOnce(error);
      const store = memoryStore({ location: location({ expiresAt: minutes(1) }), agency: agency() });
      const before = { ...store.data.location };
      await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "unavailable" });
      expect(store.data.location).toEqual(before);
      expect(client.mintLocationToken).not.toHaveBeenCalled();
    }
  });

  it("errors from the service carry a code and no token, secret or upstream text", async () => {
    client.refreshToken.mockRejectedValueOnce(transient());
    const store = memoryStore({ location: location({ expiresAt: minutes(1) }), agency: agency() });
    const error = (await service(store).getLocationToken("tenant_1").catch((e: unknown) => e)) as TokenServiceError;
    expect(error).toBeInstanceOf(TokenServiceError);
    expect(error.message).not.toMatch(/loc-refresh-1|loc-access-1|agency-/);
    expect(error.message).not.toContain("503");
  });
});

describe("token service: getLocationToken, re-mint from the agency token", () => {
  const stale = () => location({ expiresAt: minutes(1) });

  it("re-mints when the refresh token is rejected, and stores what the mint returned", async () => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    const store = memoryStore({ location: stale(), agency: agency() });
    expect(await service(store).getLocationToken("tenant_1")).toBe("minted-access");
    expect(client.mintLocationToken).toHaveBeenCalledWith("agency-access-1", "company_1", "loc_1");
    expect(store.data.location).toMatchObject({ accessToken: "minted-access", refreshToken: "minted-refresh", status: "connected" });
  });

  it("re-mints directly when there is no refresh token, without calling refresh", async () => {
    const store = memoryStore({ location: location({ refreshToken: null, expiresAt: minutes(1) }), agency: agency() });
    expect(await service(store).getLocationToken("tenant_1")).toBe("minted-access");
    expect(client.refreshToken).not.toHaveBeenCalled();
  });

  it("clears a dead refresh token when the mint came with none", async () => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    client.mintLocationToken.mockResolvedValueOnce({ accessToken: "m", refreshToken: null, expiresInSeconds: 60, locationId: "loc_1" });
    const store = memoryStore({ location: stale(), agency: agency() });
    await service(store).getLocationToken("tenant_1");
    expect(store.data.location?.refreshToken).toBeNull();
  });

  it("refreshes the agency token first when it is stale, then mints with the new one", async () => {
    client.refreshToken.mockImplementation(async (_token: string, userType: string) => {
      if (userType === "Location") throw rejected();
      return { accessToken: "agency-new", refreshToken: "agency-refresh-new", expiresInSeconds: 86_400 };
    });
    const store = memoryStore({ location: stale(), agency: agency({ expiresAt: minutes(1) }) });
    await service(store).getLocationToken("tenant_1");
    expect(client.refreshToken).toHaveBeenCalledWith("agency-refresh-1", "Company");
    expect(client.mintLocationToken).toHaveBeenCalledWith("agency-new", "company_1", "loc_1");
    expect(store.data.agency).toMatchObject({ accessToken: "agency-new", refreshToken: "agency-refresh-new" });
  });

  it("marks needs_reconnect when HighLevel rejects the mint made with a valid agency token", async () => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    client.mintLocationToken.mockRejectedValueOnce(new HighLevelHttpError("mint", 404));
    const store = memoryStore({ location: stale(), agency: agency() });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "needs_reconnect" });
    expect(store.data.location?.status).toBe("needs_reconnect");
    // and the next call does not hit HighLevel at all
    client.refreshToken.mockClear();
    client.mintLocationToken.mockClear();
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "needs_reconnect" });
    expect(client.refreshToken).not.toHaveBeenCalled();
    expect(client.mintLocationToken).not.toHaveBeenCalled();
  });

  it("does NOT mark needs_reconnect when the mint fails transiently", async () => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    client.mintLocationToken.mockRejectedValueOnce(transient());
    const store = memoryStore({ location: stale(), agency: agency() });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "unavailable" });
    expect(store.data.location?.status).toBe("connected");
  });

  it("does NOT mark needs_reconnect when the agency token cannot be refreshed (a wrong client secret must not flip every tenant)", async () => {
    client.refreshToken.mockRejectedValue(rejected()); // location AND agency refresh rejected
    const store = memoryStore({ location: stale(), agency: agency({ expiresAt: minutes(1) }) });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "agency_unavailable" });
    expect(store.data.location?.status).toBe("connected");
    expect(client.mintLocationToken).not.toHaveBeenCalled();
  });

  it("marks needs_reconnect when nothing can recover it: refresh rejected and no agency connection at all", async () => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    const store = memoryStore({ location: stale(), agency: null });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "needs_reconnect" });
    expect(store.data.location?.status).toBe("needs_reconnect");
  });

  it("marks needs_reconnect when the tenant has no companyId to re-mint with", async () => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    const store = memoryStore({ location: location({ companyId: null, expiresAt: minutes(1) }), agency: agency() });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "needs_reconnect" });
  });

  it("a connection removed while waiting for the lock is not_connected", async () => {
    const store = memoryStore({ location: stale(), agency: agency() });
    store.updateLocationLocked.mockImplementationOnce(async () => null);
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "not_connected" });
  });

  it("a tenant that turned uninstalled while waiting for the lock is not refreshed", async () => {
    const store = memoryStore({ location: stale(), agency: agency() });
    store.updateLocationLocked.mockImplementationOnce((_id, decide) =>
      decide(location({ status: "uninstalled", expiresAt: minutes(1) })).then(() => location({ status: "uninstalled" })),
    );
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "not_connected" });
    expect(client.refreshToken).not.toHaveBeenCalled();
  });
});

describe("token service: round 2 (security and audit findings)", () => {
  const stale = () => location({ expiresAt: minutes(1) });

  it("never touches the agency token while a location row lock is held (pool starvation)", async () => {
    client.refreshToken.mockImplementation(async (_t: string, userType: string) => {
      if (userType === "Location") throw rejected();
      return { accessToken: "agency-new", refreshToken: "agency-refresh-new", expiresInSeconds: 86_400 };
    });
    const store = memoryStore({ location: stale(), agency: agency({ expiresAt: minutes(1) }) });
    await service(store).getLocationToken("tenant_1");
    expect(store.held.agencyCallsWhileLocationHeld).toBe(0);
    expect(client.mintLocationToken).toHaveBeenCalledWith("agency-new", "company_1", "loc_1");
  });

  it("re-mints for many tenants of one expired agency without any lock held during the agency refresh", async () => {
    client.refreshToken.mockImplementation(async (_t: string, userType: string) => {
      if (userType === "Location") throw rejected();
      return { accessToken: "agency-new", refreshToken: "agency-refresh-new", expiresInSeconds: 86_400 };
    });
    const store = memoryStore({ location: stale(), agency: agency({ expiresAt: minutes(1) }) });
    const svc = service(store);
    const tokens = await Promise.all(Array.from({ length: 12 }, () => svc.getLocationToken("tenant_1")));
    expect(new Set(tokens)).toEqual(new Set(["minted-access"]));
    expect(store.held.agencyCallsWhileLocationHeld).toBe(0);
    expect(client.refreshToken.mock.calls.filter((c) => c[1] === "Company")).toHaveLength(1);
  });

  it("a mint answered 401 renews the agency token once and retries; the tenant stays connected", async () => {
    client.refreshToken.mockImplementation(async (_t: string, userType: string) => {
      if (userType === "Location") throw rejected();
      return { accessToken: "agency-renewed", refreshToken: "agency-refresh-2", expiresInSeconds: 86_400 };
    });
    client.mintLocationToken.mockImplementation(async (agencyToken: string, _c: string, locationId: string) => {
      if (agencyToken === "agency-access-1") throw new HighLevelHttpError("mint", 401);
      return { accessToken: "minted-after-renew", refreshToken: null, expiresInSeconds: 60, locationId };
    });
    const store = memoryStore({ location: stale(), agency: agency() });
    expect(await service(store).getLocationToken("tenant_1")).toBe("minted-after-renew");
    expect(client.mintLocationToken.mock.calls.map((c) => c[0])).toEqual(["agency-access-1", "agency-renewed"]);
    expect(store.data.location?.status).toBe("connected");
  });

  it.each([401, 403])("a mint still answered %i after the retry is an agency problem: no tenant is flipped", async (status) => {
    client.refreshToken.mockImplementation(async (_t: string, userType: string) => {
      if (userType === "Location") throw rejected();
      return { accessToken: `agency-renewed`, refreshToken: "agency-refresh-2", expiresInSeconds: 86_400 };
    });
    client.mintLocationToken.mockRejectedValue(new HighLevelHttpError("mint", status));
    const store = memoryStore({ location: stale(), agency: agency() });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "agency_unavailable" });
    expect(store.data.location?.status).toBe("connected");
    expect(client.mintLocationToken).toHaveBeenCalledTimes(2);
  });

  it("a transient agency refresh while re-minting is unavailable, never needs_reconnect", async () => {
    client.refreshToken.mockImplementation(async (_t: string, userType: string) => {
      throw userType === "Location" ? rejected() : transient();
    });
    const store = memoryStore({ location: stale(), agency: agency({ expiresAt: minutes(1) }) });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "unavailable" });
    expect(store.data.location?.status).toBe("connected");
  });

  it.each([429, 408, 500])("a mint answered %i is unavailable, never needs_reconnect", async (status) => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    client.mintLocationToken.mockRejectedValueOnce(new HighLevelHttpError("mint", status));
    const store = memoryStore({ location: stale(), agency: agency() });
    await expect(service(store).getLocationToken("tenant_1")).rejects.toMatchObject({ code: "unavailable" });
    expect(store.data.location?.status).toBe("connected");
  });

  it("a refresh that HighLevel accepted but the store failed to save is healed by a re-mint next time", async () => {
    const store = memoryStore({ location: stale(), agency: agency() });
    const goodUpdate = store.updateLocationLocked.getMockImplementation()!;
    store.updateLocationLocked.mockImplementationOnce(async (_id, decide) => {
      await decide({ ...stale() }); // HighLevel rotated the refresh token here
      throw new Error("commit failed: connection string leak-me");
    });
    const first = (await service(store).getLocationToken("tenant_1").catch((e: unknown) => e)) as TokenServiceError;
    expect(first).toBeInstanceOf(TokenServiceError);
    expect(first.code).toBe("unavailable");
    expect(first.message).not.toContain("leak-me");
    // the old refresh token is dead now
    store.updateLocationLocked.mockImplementation(goodUpdate);
    client.refreshToken.mockRejectedValue(rejected());
    expect(await service(store).getLocationToken("tenant_1")).toBe("minted-access");
  });

  it("does not refresh when the stored token already differs from the rejected one (someone else renewed it)", async () => {
    const store = memoryStore({ location: location({ accessToken: "already-renewed" }), agency: agency() });
    expect(await service(store).getLocationToken("tenant_1", { rejectedToken: "the-old-dead-one" })).toBe("already-renewed");
    expect(client.refreshToken).not.toHaveBeenCalled();
    expect(store.updateLocationLocked).not.toHaveBeenCalled();
  });

  it("serves two tenants of one agency independently (lock per tenant, agency shared)", async () => {
    const store = memoryStore({ location: stale(), agency: agency() });
    client.refreshToken.mockRejectedValue(rejected());
    const svc = service(store);
    expect(await Promise.all([svc.getLocationToken("tenant_1"), svc.getLocationToken("tenant_1")])).toEqual(["minted-access", "minted-access"]);
    expect(client.mintLocationToken).toHaveBeenCalledTimes(1);
  });
});

describe("token service: round 3 (raw store errors never reach callers; status changes during the agency fetch)", () => {
  const stale = () => location({ expiresAt: minutes(1) });
  const rawDbError = () => new Error("db secret postgres://user:pw@host/db");

  async function failure(promise: Promise<unknown>): Promise<TokenServiceError> {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TokenServiceError);
    return error as TokenServiceError;
  }
  const expectHidden = (error: TokenServiceError) => {
    expect(error.code).toBe("unavailable");
    expect(error.message).not.toContain("secret");
    expect(error.message).not.toContain("postgres");
  };

  it("hides a raw error from the first location read, and logs only the error's name", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const store = memoryStore({ location: stale(), agency: agency() });
      store.readLocationState.mockRejectedValueOnce(rawDbError());
      expectHidden(await failure(service(store).getLocationToken("tenant_1")));
      expect(spy).toHaveBeenCalledWith("HighLevel token store failed:", "Error");
      expect(JSON.stringify(spy.mock.calls)).not.toContain("secret");
    } finally {
      spy.mockRestore();
    }
  });

  it("returns null when the agency connection vanishes between the read and the lock", async () => {
    const store = memoryStore({ location: null, agency: agency({ expiresAt: minutes(1) }) });
    store.updateAgencyLocked.mockResolvedValueOnce(null);
    expect(await service(store).getAgencyToken("company_1")).toBeNull();
    expect(client.refreshToken).not.toHaveBeenCalled();
  });

  it("hides a raw error from the agency read and from the agency lock", async () => {
    const readFails = memoryStore({ location: null, agency: agency({ expiresAt: minutes(1) }) });
    readFails.readAgencyState.mockRejectedValueOnce(rawDbError());
    expectHidden(await failure(service(readFails).getAgencyToken("company_1")));

    const lockFails = memoryStore({ location: null, agency: agency({ expiresAt: minutes(1) }) });
    lockFails.updateAgencyLocked.mockRejectedValueOnce(rawDbError());
    expectHidden(await failure(service(lockFails).getAgencyToken("company_1")));
  });

  it("hides a raw error from the location lock of phase 1", async () => {
    const store = memoryStore({ location: stale(), agency: agency() });
    store.updateLocationLocked.mockRejectedValueOnce(rawDbError());
    expectHidden(await failure(service(store).getLocationToken("tenant_1")));
  });

  it("hides a raw error from the location lock of the re-mint", async () => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    const store = memoryStore({ location: stale(), agency: agency() });
    const real = store.updateLocationLocked.getMockImplementation()!;
    store.updateLocationLocked.mockImplementationOnce(real).mockImplementationOnce(async () => {
      throw rawDbError();
    });
    expectHidden(await failure(service(store).getLocationToken("tenant_1")));
    expect(client.mintLocationToken).not.toHaveBeenCalled();
  });

  it.each(["uninstalled", "needs_reconnect"] as const)(
    "does not mint or save over a tenant that became %s while the agency token was being fetched",
    async (status) => {
      client.refreshToken.mockRejectedValueOnce(rejected());
      const store = memoryStore({ location: stale(), agency: agency() });
      const readAgency = store.readAgencyState.getMockImplementation()!;
      store.readAgencyState.mockImplementationOnce(async (...args) => {
        // another request changes the tenant between phase 1 and the second lock
        store.data.location = { ...store.data.location!, status };
        return readAgency(...args);
      });
      const error = await failure(service(store).getLocationToken("tenant_1"));
      expect(error.code).toBe(status === "uninstalled" ? "not_connected" : "needs_reconnect");
      expect(client.mintLocationToken).not.toHaveBeenCalled();
      expect(store.data.location?.accessToken).toBe("loc-access-1");
      expect(store.data.location?.status).toBe(status);
    },
  );
});

describe("token service: getAgencyToken", () => {
  it("returns a fresh token without locking, null when there is no connection", async () => {
    const store = memoryStore({ location: null, agency: agency() });
    expect(await service(store).getAgencyToken("company_1")).toBe("agency-access-1");
    expect(store.updateAgencyLocked).not.toHaveBeenCalled();
    expect(await service(memoryStore({ location: null, agency: null })).getAgencyToken("company_1")).toBeNull();
  });

  it("refreshes when under 5 minutes are left and stores the rotated refresh token", async () => {
    const store = memoryStore({ location: null, agency: agency({ expiresAt: minutes(4) }) });
    expect(await service(store).getAgencyToken("company_1")).toBe("new-access-1");
    expect(store.data.agency).toMatchObject({ refreshToken: "new-refresh-1" });
  });

  it("keeps the old refresh token when the response carries none", async () => {
    client.refreshToken.mockResolvedValueOnce({ accessToken: "a", refreshToken: null, expiresInSeconds: 60 });
    const store = memoryStore({ location: null, agency: agency({ expiresAt: minutes(1) }) });
    await service(store).getAgencyToken("company_1");
    expect(store.data.agency?.refreshToken).toBe("agency-refresh-1");
  });

  it("concurrent callers cause one refresh", async () => {
    const store = memoryStore({ location: null, agency: agency({ expiresAt: minutes(1) }) });
    const svc = service(store);
    const out = await Promise.all([svc.getAgencyToken("company_1"), svc.getAgencyToken("company_1")]);
    expect(out).toEqual(["new-access-1", "new-access-1"]);
    expect(client.refreshToken).toHaveBeenCalledTimes(1);
  });

  it("reports agency_unavailable when rejected and unavailable when transient, and stores nothing", async () => {
    const store = memoryStore({ location: null, agency: agency({ expiresAt: minutes(1) }) });
    client.refreshToken.mockRejectedValueOnce(rejected());
    await expect(service(store).getAgencyToken("company_1")).rejects.toMatchObject({ code: "agency_unavailable" });
    client.refreshToken.mockRejectedValueOnce(transient());
    await expect(service(store).getAgencyToken("company_1")).rejects.toMatchObject({ code: "unavailable" });
    expect(store.data.agency?.accessToken).toBe("agency-access-1");
  });
});

describe("token service: findAgencyToken (null instead of an error, for the webhook)", () => {
  it("returns the token, or null when there is no connection or the agency must reinstall", async () => {
    const fresh = memoryStore({ location: null, agency: agency() });
    expect(await service(fresh).findAgencyToken("company_1")).toBe("agency-access-1");
    expect(await service(memoryStore({ location: null, agency: null })).findAgencyToken("company_1")).toBeNull();
    client.refreshToken.mockRejectedValueOnce(rejected());
    const dead = memoryStore({ location: null, agency: agency({ expiresAt: minutes(1) }) });
    expect(await service(dead).findAgencyToken("company_1")).toBeNull();
  });

  it("still throws when HighLevel is only temporarily unavailable, so the caller can retry", async () => {
    client.refreshToken.mockRejectedValueOnce(transient());
    const store = memoryStore({ location: null, agency: agency({ expiresAt: minutes(1) }) });
    await expect(service(store).findAgencyToken("company_1")).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("token service: withLocationToken (retry once on 401)", () => {
  const ok = () => new Response("{}", { status: 200 });
  const unauthorized = () => new Response("{}", { status: 401 });

  it("passes the token to the call and returns its response untouched", async () => {
    const store = memoryStore({ location: location(), agency: agency() });
    const call = vi.fn<(token: string) => Promise<Response>>(async () => ok());
    const response = await service(store).withLocationToken("tenant_1", call);
    expect(response.status).toBe(200);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("loc-access-1");
  });

  it("on a 401 refreshes once and calls again with the new token", async () => {
    const store = memoryStore({ location: location(), agency: agency() });
    const call = vi.fn(async (token: string) => (token === "loc-access-1" ? unauthorized() : ok()));
    const response = await service(store).withLocationToken("tenant_1", call);
    expect(response.status).toBe(200);
    expect(call.mock.calls.map((c) => c[0])).toEqual(["loc-access-1", "new-access-1"]);
    expect(client.refreshToken).toHaveBeenCalledTimes(1);
  });

  it("refreshes even though the stored expiry still looks fine (the server says it is dead)", async () => {
    const store = memoryStore({ location: location({ expiresAt: minutes(600) }), agency: agency() });
    const call = vi.fn(async (token: string) => (token === "loc-access-1" ? unauthorized() : ok()));
    await service(store).withLocationToken("tenant_1", call);
    expect(client.refreshToken).toHaveBeenCalledTimes(1);
  });

  it("retries only once: a second 401 is returned as is, no third call, no second refresh", async () => {
    const store = memoryStore({ location: location(), agency: agency() });
    const call = vi.fn<(token: string) => Promise<Response>>(async () => unauthorized());
    const response = await service(store).withLocationToken("tenant_1", call);
    expect(response.status).toBe(401);
    expect(call).toHaveBeenCalledTimes(2);
    expect(client.refreshToken).toHaveBeenCalledTimes(1);
  });

  it("does not retry on other failures (403, 500)", async () => {
    for (const status of [403, 404, 429, 500]) {
      const store = memoryStore({ location: location(), agency: agency() });
      const call = vi.fn<(token: string) => Promise<Response>>(async () => new Response("{}", { status }));
      const response = await service(store).withLocationToken("tenant_1", call);
      expect(response.status).toBe(status);
      expect(call).toHaveBeenCalledTimes(1);
    }
    expect(client.refreshToken).not.toHaveBeenCalled();
  });

  it("many concurrent 401s on the same dead token rotate the refresh token once", async () => {
    const store = memoryStore({ location: location(), agency: agency() });
    const svc = service(store);
    const call = async (token: string) => (token === "loc-access-1" ? unauthorized() : ok());
    const responses = await Promise.all([1, 2, 3, 4].map(() => svc.withLocationToken("tenant_1", call)));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(client.refreshToken).toHaveBeenCalledTimes(1);
  });

  it("surfaces a needs_reconnect from the forced refresh instead of calling again", async () => {
    client.refreshToken.mockRejectedValueOnce(rejected());
    client.mintLocationToken.mockRejectedValueOnce(new HighLevelHttpError("m", 404));
    const store = memoryStore({ location: location(), agency: agency() });
    const call = vi.fn<(token: string) => Promise<Response>>(async () => unauthorized());
    await expect(service(store).withLocationToken("tenant_1", call)).rejects.toMatchObject({ code: "needs_reconnect" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not call at all for a tenant that is not connected", async () => {
    const store = memoryStore({ location: location({ status: "needs_reconnect" }), agency: agency() });
    const call = vi.fn<(token: string) => Promise<Response>>(async () => ok());
    await expect(service(store).withLocationToken("tenant_1", call)).rejects.toMatchObject({ code: "needs_reconnect" });
    expect(call).not.toHaveBeenCalled();
  });
});
