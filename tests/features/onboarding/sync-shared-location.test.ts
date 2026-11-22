import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSync, type SyncDeps } from "@/features/onboarding";

// A location listed by two agencies in one run must never be attached to whichever came first.
const counts = { created: 0, linked: 0, existing: 0, restored: 0, deactivated: 0, skippedAgency: 0, skippedConflict: 0, skippedInvalid: 0, capped: 0, suspicious: 0, failed: 0 };
const item = (locationId: string) => ({ locationId, name: `Name ${locationId}` });

let lists: Record<string, ReturnType<typeof item>[]>;
let known: Record<string, Array<{ tenantId: string; locationId: string }>>;
let installedCalls: string[];
let deps: SyncDeps;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  installedCalls = [];
  known = {};
  lists = { co_a: [item("loc_shared"), item("loc_a")], co_b: [item("loc_shared"), item("loc_b")] };
  deps = {
    now: () => new Date("2026-11-22T10:00:00.000Z"),
    companyIds: async () => Object.keys(lists),
    agency: async (companyId) => ({
      installed: async () => {
        installedCalls.push(companyId);
        return lists[companyId];
      },
      locations: async () => [],
    }),
    connectedTenants: async (companyId) => known[companyId] ?? [],
    onboard: vi.fn(async () => ({ tenantId: "t_new", users: { ...counts } })),
    resyncUsers: vi.fn(async () => ({ ...counts })),
    claimAlerts: vi.fn(async () => []),
    releaseAlerts: vi.fn(async () => {}),
    adminEmail: null,
    installLink: "https://app.example.test/install",
    send: vi.fn(async () => ({ delivered: true })),
  };
});

afterEach(() => vi.restoreAllMocks());

describe("runSync: a location listed by more than one agency", () => {
  it("is not onboarded; the others are; it counts once; the log has a reason code and no ids", async () => {
    const summary = await runSync(deps);
    const onboarded = (deps.onboard as ReturnType<typeof vi.fn>).mock.calls.map(([input]) => input.locationId);
    expect(onboarded).toEqual(["loc_a", "loc_b"]);
    expect(summary).toMatchObject({ onboarded: 2, failures: 1 });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("location_listed_by_multiple_agencies");
    for (const id of ["loc_shared", "co_a", "co_b"]) expect(logged).not.toContain(id);
  });

  it("reads each agency's list once, all before the first onboarding", async () => {
    (deps.onboard as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      expect(installedCalls).toEqual(["co_a", "co_b"]);
      return { tenantId: "t_new", users: { ...counts } };
    });
    const summary = await runSync(deps);
    expect(installedCalls).toEqual(["co_a", "co_b"]);
    expect(summary.failures).toBe(1);
  });

  it("a known tenant keeps resyncing under its own company, and the other agency does not onboard it", async () => {
    known = { co_a: [{ tenantId: "t_shared", locationId: "loc_shared" }] };
    await runSync(deps);
    expect(deps.resyncUsers).toHaveBeenCalledTimes(1);
    expect(deps.resyncUsers).toHaveBeenCalledWith("t_shared");
    const onboarded = (deps.onboard as ReturnType<typeof vi.fn>).mock.calls.map(([input]) => input.locationId);
    expect(onboarded).not.toContain("loc_shared");
  });

  it("a duplicate inside one agency's list is not treated as shared", async () => {
    lists = { co_a: [item("loc_a"), item("loc_a")] };
    const summary = await runSync(deps);
    expect(summary.failures).toBe(0);
    expect(deps.onboard).toHaveBeenCalled();
  });
});
