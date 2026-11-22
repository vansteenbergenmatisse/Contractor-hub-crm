import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HighLevelUser } from "@/features/highlevel";
import { handleSync, onboardLocation, runSync, syncTenantUsers, buildAlertMessage, type OnboardDeps, type SyncDeps } from "@/features/onboarding";

const ghl = (id: string, over: Partial<HighLevelUser> = {}): HighLevelUser => ({
  id, email: `${id}@x.test`, name: id.toUpperCase(), deleted: false, roleType: "account", role: "user", locationIds: [], ...over,
});

function userDeps() {
  const links = new Map<string, string>(); // ghlUserId -> userId
  const created: string[] = [];
  const deactivated: string[] = [];
  return {
    links, created, deactivated,
    deps: {
      provision: vi.fn(async (input: { ghlUserId: string; ghlRoleType: string | null; allowCreate?: boolean }) => {
        if (input.ghlRoleType === "agency") return { outcome: "skipped_agency" as const, userId: null };
        if (links.has(input.ghlUserId)) return { outcome: "exists" as const, userId: links.get(input.ghlUserId) as string };
        if (input.allowCreate === false) return { outcome: "capped" as const, userId: null };
        links.set(input.ghlUserId, `user-${input.ghlUserId}`);
        created.push(input.ghlUserId);
        return { outcome: "created" as const, userId: `user-${input.ghlUserId}` };
      }),
      deactivate: vi.fn(async (_t: string, ghlUserId: string) => { links.delete(ghlUserId); deactivated.push(ghlUserId); return true; }),
      activeLinks: vi.fn(async () => [...links.entries()].map(([ghlUserId, userId]) => ({ ghlUserId, userId }))),
    },
  };
}

describe("syncTenantUsers", () => {
  it("creates every HighLevel user once, skips agency users, and counts", async () => {
    const { deps, created } = userDeps();
    const counts = await syncTenantUsers(deps, "t1", [ghl("a"), ghl("b"), ghl("c", { roleType: "agency" })]);
    expect(created).toEqual(["a", "b"]);
    expect(counts).toMatchObject({ created: 2, skippedAgency: 1, failed: 0 });
    expect(await syncTenantUsers(deps, "t1", [ghl("a"), ghl("b")])).toMatchObject({ created: 0, existing: 2 });
  });

  it("adds a user that appears later (UserCreate) and blocks one that disappears or is deleted (UserDelete)", async () => {
    const { deps, created, deactivated } = userDeps();
    await syncTenantUsers(deps, "t1", [ghl("a"), ghl("b")]);
    await syncTenantUsers(deps, "t1", [ghl("a"), ghl("b"), ghl("c")]);
    expect(created).toEqual(["a", "b", "c"]);
    await syncTenantUsers(deps, "t1", [ghl("a"), ghl("b", { deleted: true })]);
    expect(deactivated.sort()).toEqual(["b", "c"]);
  });

  it("never deactivates anyone when HighLevel answers an empty list", async () => {
    const { deps, deactivated } = userDeps();
    await syncTenantUsers(deps, "t1", [ghl("a")]);
    await syncTenantUsers(deps, "t1", []);
    expect(deactivated).toEqual([]);
  });

  it("counts a failing user and goes on with the others", async () => {
    const { deps } = userDeps();
    deps.provision.mockRejectedValueOnce(new Error("db")).mockImplementation(async (input: { ghlUserId: string }) => ({ outcome: "created" as const, userId: input.ghlUserId }));
    const counts = await syncTenantUsers(deps, "t1", [ghl("a"), ghl("b")]);
    expect(counts).toMatchObject({ failed: 1, created: 1 });
  });
});

describe("onboardLocation (INSTALL, callback and sync share it)", () => {
  it("connects the location, lists its users with the new token, and creates them", async () => {
    const { deps, created } = userDeps();
    const onboardDeps: OnboardDeps = {
      ...deps,
      connect: vi.fn(async () => ({ tenantId: "t1", accessToken: "tok-1" })),
      listUsers: vi.fn(async () => [ghl("a"), ghl("b")]),
    };
    const result = await onboardLocation(onboardDeps, { companyId: "co_1", locationId: "loc_1", name: "Acme" });
    expect(onboardDeps.connect).toHaveBeenCalledWith({ companyId: "co_1", locationId: "loc_1", name: "Acme" });
    expect(onboardDeps.listUsers).toHaveBeenCalledWith("tok-1", "co_1", "loc_1");
    expect(result.tenantId).toBe("t1");
    expect(result.users.created).toBe(2);
    expect(created).toEqual(["a", "b"]);
  });

  it("creates no user when connecting fails", async () => {
    const { deps, created } = userDeps();
    await expect(onboardLocation({ ...deps, connect: async () => { throw new Error("no token"); }, listUsers: async () => [] }, { companyId: "c", locationId: "l", name: null })).rejects.toThrow("no token");
    expect(created).toEqual([]);
  });
});

describe("runSync", () => {
  const NOW = new Date("2026-11-22T10:00:00.000Z");
  let deps: SyncDeps;
  let alertsClaimed: string[];
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    alertsClaimed = [];
    const empty = { created: 0, linked: 0, existing: 0, restored: 0, deactivated: 0, skippedAgency: 0, skippedConflict: 0, skippedInvalid: 0, capped: 0, suspicious: 0, failed: 0 };
    deps = {
      now: () => NOW,
      companyIds: async () => ["co_1"],
      agency: async () => ({
        installed: async () => [{ locationId: "loc_known", name: "Known" }, { locationId: "loc_new", name: "New" }],
        locations: async () => [
          { locationId: "loc_known", name: "Known", email: null },
          { locationId: "loc_new", name: "New", email: null },
          { locationId: "loc_none", name: "No App Yet", email: null },
        ],
      }),
      connectedTenants: async () => [{ tenantId: "t_known", locationId: "loc_known" }],
      onboard: vi.fn(async () => ({ tenantId: "t_new", users: { ...empty, created: 3 } })),
      resyncUsers: vi.fn(async () => ({ ...empty, created: 1 })),
      claimAlerts: vi.fn(async (_c: string, missing: ReadonlyArray<{ locationId: string; name: string | null }>) => { alertsClaimed.push(...missing.map((m) => m.locationId)); return [...missing]; }),
      releaseAlerts: vi.fn(async () => {}),
      adminEmail: "admin@example.test",
      installLink: "https://app.example.test/api/integrations/oauth/start",
      send: vi.fn(async () => ({ delivered: true })),
    };
  });

  it("onboards an installed location that is missing in the database and resyncs the known one", async () => {
    const summary = await runSync(deps);
    expect(deps.onboard).toHaveBeenCalledTimes(1);
    expect(deps.onboard).toHaveBeenCalledWith({ companyId: "co_1", locationId: "loc_new", name: "New" });
    expect(deps.resyncUsers).toHaveBeenCalledWith("t_known");
    expect(summary).toMatchObject({ companies: 1, installedLocations: 2, onboarded: 1, usersCreated: 4, missingApp: 1, alertsSent: 1, failures: 0 });
  });

  it("alerts the admin about sub-accounts without the app, with the name and the install link", async () => {
    await runSync(deps);
    expect(alertsClaimed).toEqual(["loc_none"]);
    const message = (deps.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(message).toMatchObject({ kind: "admin_alert", to: "admin@example.test" });
    expect(message.text).toContain("No App Yet");
    expect(message.text).toContain("https://app.example.test/api/integrations/oauth/start");
  });

  it("sends no mail when nothing is due (claimed within 24 hours)", async () => {
    deps.claimAlerts = vi.fn(async () => []);
    const summary = await runSync(deps);
    expect(deps.send).not.toHaveBeenCalled();
    expect(summary.alertsSent).toBe(0);
  });

  it("releases the claim when the mail cannot be sent, and counts a failure", async () => {
    (deps.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("resend down"));
    const summary = await runSync(deps);
    expect(deps.releaseAlerts).toHaveBeenCalledWith(["loc_none"]);
    expect(summary.failures).toBe(1);
  });

  it("skips the alert, and releases it, when ADMIN_ALERT_EMAIL is not set", async () => {
    deps.adminEmail = null;
    await runSync(deps);
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.releaseAlerts).toHaveBeenCalledWith(["loc_none"]);
  });

  it("counts one failing location and still handles the next one", async () => {
    (deps.onboard as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("mint refused"));
    const summary = await runSync(deps);
    expect(summary.failures).toBe(1);
    expect(deps.resyncUsers).toHaveBeenCalled();
  });

  it("skips an agency with no usable token and one whose installed list fails", async () => {
    deps.companyIds = async () => ["a", "b"];
    deps.agency = vi.fn(async (c: string) => (c === "a" ? null : { installed: async () => { throw new Error("hl 500"); }, locations: async () => [] }));
    const summary = await runSync(deps);
    expect(summary).toMatchObject({ companies: 2, failures: 1, onboarded: 0 });
  });

  it("logs counts only: no names, ids or emails", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await runSync(deps);
    const line = info.mock.calls.map((c) => String(c[0])).join("\n");
    expect(line).toContain("onboarded=1");
    for (const secret of ["Known", "loc_new", "admin@example.test", "No App Yet"]) expect(line).not.toContain(secret);
  });
});

describe("buildAlertMessage", () => {
  it("pluralises the subject", () => {
    expect(buildAlertMessage("a@x.test", "l", [{ locationId: "1", name: "A" }]).subject).toBe("1 sub-account without the CRM app");
    expect(buildAlertMessage("a@x.test", "l", [{ locationId: "1", name: null }, { locationId: "2", name: "B" }]).subject).toBe("2 sub-accounts without the CRM app");
  });
});

describe("handleSync (the endpoint)", () => {
  const run = vi.fn(async () => ({ companies: 1, installedLocations: 0, onboarded: 0, usersCreated: 0, missingApp: 0, alertsSent: 0, failures: 0 }));
  const call = (header: string | null, secret: string | undefined = "s3cret-value") =>
    handleSync(new Request("https://app.example.test/api/integrations/sync", { method: "POST", headers: header ? { authorization: header } : {} }), { cronSecret: secret, run });

  beforeEach(() => run.mockClear());

  it("runs with the right Bearer secret and returns counts only", async () => {
    const response = await call("Bearer s3cret-value");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ companies: 1 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([["no header", null], ["a wrong secret", "Bearer nope"], ["a prefix of the secret", "Bearer s3cret"], ["not Bearer", "Basic s3cret-value"], ["an empty bearer", "Bearer "]])("answers 401 and runs nothing with %s", async (_l, header) => {
    expect((await call(header)).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when CRON_SECRET is not configured, even with a header", async () => {
    const bare = (secret: string | undefined) =>
      handleSync(new Request("https://app.example.test/s", { method: "POST", headers: { authorization: "Bearer anything" } }), { cronSecret: secret, run });
    expect((await bare(undefined)).status).toBe(500);
    expect((await bare("")).status).toBe(500);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 500 with an empty body when the run throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    run.mockRejectedValueOnce(new Error("boom"));
    const response = await call("Bearer s3cret-value");
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
  });
});

describe("syncTenantUsers: hardening after the security review", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ghl(`g${i}`));

  it("creates at most 50 new users per pass, reports the rest as capped, and finishes them next pass", async () => {
    const { deps, created } = userDeps();
    const first = await syncTenantUsers(deps, "t1", many(120));
    expect(first.created).toBe(50);
    expect(first.capped).toBe(70);
    expect(created).toHaveLength(50);
    const second = await syncTenantUsers(deps, "t1", many(120));
    expect(second.created).toBe(50);
    expect(created).toHaveLength(100);
  });

  it("blocks nobody when a pass would block more than half of the tenant's users at once", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, deactivated } = userDeps();
    await syncTenantUsers(deps, "t1", many(10));
    const counts = await syncTenantUsers(deps, "t1", many(3)); // a cut-off answer: 7 of 10 missing
    expect(deactivated).toEqual([]);
    expect(counts.suspicious).toBe(7);
  });

  it("still blocks a small, believable change (one of ten)", async () => {
    const { deps, deactivated } = userDeps();
    await syncTenantUsers(deps, "t1", many(10));
    await syncTenantUsers(deps, "t1", many(9));
    expect(deactivated).toEqual(["g9"]);
  });

  it("still blocks the only other user of a two-person tenant (below the minimum for the guard)", async () => {
    const { deps, deactivated } = userDeps();
    await syncTenantUsers(deps, "t1", [ghl("a"), ghl("b")]);
    await syncTenantUsers(deps, "t1", [ghl("a")]);
    expect(deactivated).toEqual(["b"]);
  });
});
