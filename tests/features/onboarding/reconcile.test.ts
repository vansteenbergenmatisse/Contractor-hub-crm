import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyUserCounts, handleCheckSubAccounts, onboardLocation, runSync, throttledCompanyIds, type OnboardDeps, type SyncDeps, type SyncSummary } from "@/features/onboarding";

// The on-demand reconcile that replaces the production-only cron on dev and staging: admin visit
// (background) and the "Check for new sub-accounts" button.
const NOW = new Date("2026-11-24T10:00:00.000Z");

function syncDeps(over: Partial<SyncDeps> = {}) {
  const locations = vi.fn(async () => [
    { locationId: "loc_known", name: "Known", email: null },
    { locationId: "loc_new", name: "New", email: null },
    { locationId: "loc_no_app", name: "Other sub-account", email: null },
  ]);
  const deps = {
    now: () => NOW,
    companyIds: vi.fn(async () => ["co_1"]),
    agency: vi.fn(async () => ({
      installed: async () => [
        { locationId: "loc_known", name: "Known" },
        { locationId: "loc_new", name: "New" },
      ],
      locations,
    })),
    connectedTenants: vi.fn(async () => [{ tenantId: "t_known", locationId: "loc_known" }]),
    onboard: vi.fn(async () => ({ tenantId: "t_new", users: emptyUserCounts() })),
    resyncUsers: vi.fn(async () => emptyUserCounts()),
    claimAlerts: vi.fn(async (_c: string, missing: ReadonlyArray<{ locationId: string; name: string | null }>) => [...missing]),
    releaseAlerts: vi.fn(async () => {}),
    adminEmail: "admin@example.test",
    installLink: "https://app.example.test/api/integrations/oauth/start",
    send: vi.fn(async () => ({ delivered: true })),
    claimAgencyAlert: vi.fn(async () => true),
    ...over,
  };
  return { deps, locations };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("runSync with alerts off", () => {
  it("onboards only what HighLevel lists as installed, never the agency's other sub-accounts", async () => {
    const { deps } = syncDeps({ alerts: false });
    const summary = await runSync(deps);
    expect(deps.onboard).toHaveBeenCalledTimes(1);
    expect(deps.onboard).toHaveBeenCalledWith({ companyId: "co_1", locationId: "loc_new", name: "New" });
    expect(summary.onboarded).toBe(1);
  });

  it("sends no mail, claims no alert and does not read the full sub-account list", async () => {
    const { deps, locations } = syncDeps({ alerts: false });
    await runSync(deps);
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.claimAlerts).not.toHaveBeenCalled();
    expect(locations).not.toHaveBeenCalled();
  });

  it("an agency without a usable token claims no agency alert", async () => {
    const { deps } = syncDeps({ alerts: false, agency: vi.fn(async () => null) });
    await runSync(deps);
    expect(deps.claimAgencyAlert).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("the daily cron default still sends the missing-app mail", async () => {
    const { deps } = syncDeps();
    await runSync(deps);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
});

describe("runSync with resyncKnown off", () => {
  it("leaves known tenants alone and still onboards new ones", async () => {
    const { deps } = syncDeps({ alerts: false, resyncKnown: false });
    await runSync(deps);
    expect(deps.resyncUsers).not.toHaveBeenCalled();
    expect(deps.onboard).toHaveBeenCalledTimes(1);
  });

  it("by default known tenants are re-read (repairs a users sync that failed after INSTALL)", async () => {
    const { deps } = syncDeps({ alerts: false });
    await runSync(deps);
    expect(deps.resyncUsers).toHaveBeenCalledWith("t_known");
  });

  it("a failed onboard is counted and the run goes on", async () => {
    const { deps } = syncDeps({ alerts: false, onboard: vi.fn(async () => { throw new Error("mint failed"); }) });
    const summary = await runSync(deps);
    expect(summary.failures).toBe(1);
    expect(summary.onboarded).toBe(0);
  });
});

describe("onboardLocation passes listedAt to connect", () => {
  it("so a location uninstalled after the list was read is not revived", async () => {
    const deps: OnboardDeps = {
      connect: vi.fn(async () => ({ tenantId: "t1", accessToken: "tok" })),
      listUsers: vi.fn(async () => []),
      provision: vi.fn(async () => ({ outcome: "exists" as const, userId: "u" })),
      deactivate: vi.fn(async () => true),
      activeLinks: vi.fn(async () => []),
    };
    await onboardLocation(deps, { companyId: "co_1", locationId: "loc_1", name: null, listedAt: NOW });
    expect(deps.connect).toHaveBeenCalledWith({ companyId: "co_1", locationId: "loc_1", name: null, listedAt: NOW });
  });
});

describe("throttledCompanyIds", () => {
  it("keeps only the agencies whose claim succeeds", async () => {
    const claim = vi.fn(async (id: string) => id !== "co_2");
    const ids = await throttledCompanyIds(async () => ["co_1", "co_2", "co_3"], claim)();
    expect(ids).toEqual(["co_1", "co_3"]);
    expect(claim).toHaveBeenCalledTimes(3);
  });

  it("a claim that throws counts as not due", async () => {
    const ids = await throttledCompanyIds(async () => ["co_1", "co_2"], async (id) => {
      if (id === "co_1") throw new Error("db");
      return true;
    })();
    expect(ids).toEqual(["co_2"]);
  });
});

describe("handleCheckSubAccounts", () => {
  const ORIGIN = "https://crm.example.test";
  const summary: SyncSummary = { companies: 1, installedLocations: 3, onboarded: 2, usersCreated: 4, missingApp: 0, alertsSent: 0, failures: 0 };
  const request = (origin: string | null = ORIGIN) =>
    new Request(`${ORIGIN}/api/admin/sub-accounts/check`, { method: "POST", headers: origin ? { origin } : {} });
  const deps = (over: Partial<Parameters<typeof handleCheckSubAccounts>[1]> = {}) => ({
    appOrigin: ORIGIN,
    adminId: vi.fn(async () => "admin_1"),
    allow: vi.fn(async () => true),
    run: vi.fn(async () => summary),
    ...over,
  });

  it("an admin on the same origin runs it and gets counts only", async () => {
    const d = deps();
    const response = await handleCheckSubAccounts(request(), d);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ connected: 2, installed: 3, agencies: 1, failures: 0 });
    expect(d.allow).toHaveBeenCalledWith("admin_1");
    expect(d.run).toHaveBeenCalledTimes(1);
  });

  it.each([["another origin", "https://evil.example.test"], ["no origin", null]])("%s: 403 and nothing runs", async (_n, origin) => {
    const d = deps();
    expect((await handleCheckSubAccounts(request(origin), d)).status).toBe(403);
    expect(d.adminId).not.toHaveBeenCalled();
    expect(d.run).not.toHaveBeenCalled();
  });

  it("not an admin: 403 and nothing runs", async () => {
    const d = deps({ adminId: vi.fn(async () => null) });
    expect((await handleCheckSubAccounts(request(), d)).status).toBe(403);
    expect(d.run).not.toHaveBeenCalled();
  });

  it("over the limit: 429 and nothing runs", async () => {
    const d = deps({ allow: vi.fn(async () => false) });
    expect((await handleCheckSubAccounts(request(), d)).status).toBe(429);
    expect(d.run).not.toHaveBeenCalled();
  });

  it("a failing run: 500 with a fixed body", async () => {
    const d = deps({ run: vi.fn(async () => { throw new Error("secret detail"); }) });
    const response = await handleCheckSubAccounts(request(), d);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});

// The wiring (admin visit, button, route file) is tested by behavior in reconcile-wiring.test.ts.
