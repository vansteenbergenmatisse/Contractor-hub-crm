import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HighLevelUser } from "@/features/highlevel";
import { createHighLevelClient } from "@/features/highlevel";
import { emptyUserCounts, runSync, syncTenantUsers, type SyncDeps, type UserSyncDeps } from "@/features/onboarding";
import { claimAlerts } from "../../../src/features/onboarding/db/alerts";

const prisma = vi.hoisted(() => ({ missingAppAlert: { deleteMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() } }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => prisma }));

const NOW = new Date("2026-11-23T05:00:00.000Z");
const item = (locationId: string) => ({ locationId, name: `Name ${locationId}` });

function baseDeps(over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    now: () => NOW,
    companyIds: async () => ["co_1"],
    agency: async () => ({ installed: async () => [item("loc_live")], locations: async () => [{ ...item("loc_live"), email: null }] }),
    connectedTenants: async () => [{ tenantId: "t_live", locationId: "loc_live" }],
    onboard: vi.fn(async () => ({ tenantId: "t_new", users: emptyUserCounts() })),
    resyncUsers: vi.fn(async () => emptyUserCounts()),
    claimAlerts: vi.fn(async (_c, missing) => [...missing]),
    releaseAlerts: vi.fn(async () => {}),
    adminEmail: "admin@example.test",
    installLink: "https://app.example.test/install",
    send: vi.fn(async () => ({ delivered: true })),
    ...over,
  };
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("H1: a connected tenant missing from a complete installed list", () => {
  const drifted = { connectedTenants: async () => [{ tenantId: "t_live", locationId: "loc_live" }, { tenantId: "t_gone", locationId: "loc_gone" }] };

  it("alerts the admin and logs without ids", async () => {
    const deps = baseDeps(drifted);
    await runSync(deps);
    expect(deps.claimAlerts).toHaveBeenCalledWith("co_1", [{ locationId: "loc_gone", name: null }], NOW);
    const message = (deps.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(message.kind).toBe("admin_alert");
    expect(message.text).toContain("loc_gone");
    expect(message.text).toContain("still connected");
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("connected_tenant_not_listed count=1");
    for (const id of ["loc_gone", "t_gone", "co_1"]) expect(logged).not.toContain(id);
    expect(deps.resyncUsers).toHaveBeenCalledTimes(1);
  });

  it("does not list it twice when the agency list still has it", async () => {
    const deps = baseDeps({
      ...drifted,
      agency: async () => ({ installed: async () => [item("loc_live")], locations: async () => [{ ...item("loc_live"), email: null }, { ...item("loc_gone"), email: null }] }),
    });
    await runSync(deps);
    expect(deps.claimAlerts).toHaveBeenCalledWith("co_1", [item("loc_gone")], NOW);
  });

  it("does not alert when the installed list could not be read", async () => {
    const deps = baseDeps({ ...drifted, agency: async () => ({ installed: async () => { throw new Error("hl 500"); }, locations: async () => [] }) });
    await runSync(deps);
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.claimAlerts).not.toHaveBeenCalled();
  });

  it("still alerts when the agency location list fails, without forgetting other alerts", async () => {
    const deps = baseDeps({ ...drifted, agency: async () => ({ installed: async () => [item("loc_live")], locations: async () => { throw new Error("hl 500"); } }) });
    const summary = await runSync(deps);
    expect(deps.claimAlerts).toHaveBeenCalledWith("co_1", [{ locationId: "loc_gone", name: null }], NOW, { keepOthers: true });
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(summary.failures).toBe(1);
  });

  it("claimAlerts with keepOthers leaves the other throttle rows alone", async () => {
    prisma.missingAppAlert.deleteMany.mockReset();
    prisma.missingAppAlert.updateMany.mockReset().mockResolvedValue({ count: 1 });
    await claimAlerts("co_1", [{ locationId: "loc_gone", name: null }], NOW, { keepOthers: true });
    expect(prisma.missingAppAlert.deleteMany).not.toHaveBeenCalled();
  });
});

describe("H5: shared time budget and rotating start", () => {
  const many = Array.from({ length: 4 }, (_, i) => item(`loc_${i}`));
  const connected = many.map((l, i) => ({ tenantId: `t_${i}`, locationId: l.locationId }));
  const agency = async () => ({ installed: async () => many, locations: async () => many.map((l) => ({ ...l, email: null })) });

  it("starts no new tenant after the deadline and logs the skipped count", async () => {
    let ms = NOW.getTime();
    const resyncUsers = vi.fn(async () => { ms += 20_000; return emptyUserCounts(); });
    await runSync(baseDeps({ now: () => new Date(ms), agency, connectedTenants: async () => connected, resyncUsers }));
    expect(resyncUsers).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(info.mock.calls)).toContain("skipped=2");
  });

  it("counts time already spent before the sync", async () => {
    const resyncUsers = vi.fn(async () => emptyUserCounts());
    await runSync(baseDeps({ startedAt: new Date(NOW.getTime() - 36_000), agency, connectedTenants: async () => connected, resyncUsers }));
    expect(resyncUsers).not.toHaveBeenCalled();
  });

  it("starts at the rotated offset", async () => {
    const resyncUsers = vi.fn(async (_tenantId: string) => emptyUserCounts());
    await runSync(baseDeps({ startOffset: (length) => (length === 4 ? 2 : 0), agency, connectedTenants: async () => connected, resyncUsers }));
    expect(resyncUsers.mock.calls.map(([id]) => id)).toEqual(["t_2", "t_3", "t_0", "t_1"]);
  });

  it("runs the alert step even when tenants use up the budget", async () => {
    let ms = NOW.getTime();
    const deps = baseDeps({
      now: () => new Date(ms),
      agency,
      connectedTenants: async () => [...connected, { tenantId: "t_gone", locationId: "loc_gone" }],
      resyncUsers: vi.fn(async () => { ms += 40_000; return emptyUserCounts(); }),
    });
    await runSync(deps);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("onboards nothing new when an agency's list was skipped, so a shared location cannot attach to the wrong one", async () => {
    let ms = NOW.getTime();
    const deps = baseDeps({
      now: () => new Date(ms),
      companyIds: async () => ["co_1", "co_2"],
      agency: async () => { ms += 36_000; return { installed: async () => [item("loc_new")], locations: async () => [] }; },
      connectedTenants: async () => [],
    });
    await runSync(deps);
    expect(deps.onboard).not.toHaveBeenCalled();
  });
});

describe("H6: a lost agency token is not silent", () => {
  const lost = { agency: async () => null };

  it("logs an error without ids and mails the admin", async () => {
    const claimAgencyAlert = vi.fn(async () => true);
    const deps = baseDeps({ ...lost, claimAgencyAlert });
    const summary = await runSync(deps);
    expect(claimAgencyAlert).toHaveBeenCalledWith("co_1", NOW);
    const message = (deps.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(message).toMatchObject({ kind: "admin_alert", to: "admin@example.test" });
    expect(message.text).toContain("https://app.example.test/install");
    expect(summary.alertsSent).toBe(1);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("agency_token_unusable");
    expect(logged).not.toContain("co_1");
  });

  it("sends nothing inside the throttle window", async () => {
    const deps = baseDeps({ ...lost, claimAgencyAlert: vi.fn(async () => false) });
    await runSync(deps);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("a failed mail is counted and does not stop the run", async () => {
    const deps = baseDeps({ ...lost, claimAgencyAlert: vi.fn(async () => true), send: vi.fn(async () => { throw new Error("mail down"); }) });
    await expect(runSync(deps)).resolves.toMatchObject({ failures: 1, alertsSent: 0 });
  });
});

describe("H7: a listed user with no email", () => {
  const ghl = (id: string): HighLevelUser => ({ id, email: `${id}@x.test`, name: id, deleted: false, roleType: "account", role: "user", locationIds: [] });
  const userDeps = (linked: string[]): UserSyncDeps => ({
    provision: vi.fn(async () => ({ outcome: "exists" as const, userId: "u" })),
    deactivate: vi.fn(async () => true),
    activeLinks: vi.fn(async () => linked.map((ghlUserId) => ({ ghlUserId, userId: `user-${ghlUserId}` }))),
  });
  const parsed = (users: unknown[]) =>
    createHighLevelClient({
      baseUrl: "https://hl.example.test",
      appId: "app-1",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUri: "https://app.example.test/cb",
      fetch: async () => new Response(JSON.stringify({ users }), { status: 200, headers: { "content-type": "application/json" } }),
    }).listLocationUsers("tok", "co_1", "loc_1");

  it("is not blocked, and is not provisioned", async () => {
    const list = await parsed([{ id: "kept", name: "No Mail" }, { id: "a", email: "a@x.test" }]);
    const deps = userDeps(["a", "kept"]);
    await syncTenantUsers(deps, "t1", list);
    expect(deps.deactivate).not.toHaveBeenCalled();
    expect(deps.provision).toHaveBeenCalledTimes(1);
  });

  it("is still blocked when HighLevel marks that entry deleted", async () => {
    const list = await parsed([{ id: "gone", deleted: true }, { id: "a", email: "a@x.test" }]);
    const deps = userDeps(["a", "gone"]);
    await syncTenantUsers(deps, "t1", list);
    expect(deps.deactivate).toHaveBeenCalledWith("t1", "gone");
  });

  it("a user absent from the list is still blocked", async () => {
    const deps = userDeps(["a", "absent"]);
    await syncTenantUsers(deps, "t1", [ghl("a")]);
    expect(deps.deactivate).toHaveBeenCalledWith("t1", "absent");
  });
});
