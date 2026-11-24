import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLoginLockBackfillInput, runReviewedLoginLockBackfill, type BackfillInput } from "@/features/admin";

const prismaMock = vi.hoisted(() => ({
  tenant: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  ghlUserLink: { findMany: vi.fn() },
}));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => prismaMock }));

const tenant = (id: string, locked = false) => ({ id, name: id.toUpperCase(), status: "connected" as const, locked });
const user = (tenantId: string, disabled: boolean, removed = false) => ({ tenantId, disabled, removed });

// off-a and off-b qualify. hand-blocked is one person blocked with an unmarked link, which is also
// what a half-finished HighLevel removal looks like.
const input: BackfillInput = {
  tenants: [tenant("off-a"), tenant("off-b"), tenant("hand-blocked"), tenant("active"), tenant("locked", true), tenant("removed")],
  users: [
    user("off-a", true),
    user("off-a", true),
    user("off-b", true),
    user("hand-blocked", true),
    user("active", false),
    user("locked", true),
    user("removed", true, true),
  ],
};

const deps = (data: BackfillInput = input) => ({
  read: vi.fn(async () => data),
  createLocks: vi.fn(async (ids: string[]) => ids.length),
  log: vi.fn(),
});
const logged = (d: ReturnType<typeof deps>) => d.log.mock.calls.map(([line]) => String(line)).join("\n");

async function expectRefused(args: string[], data: BackfillInput = input) {
  const d = deps(data);
  const result = await runReviewedLoginLockBackfill(args, d);
  expect(d.createLocks).not.toHaveBeenCalled();
  expect(result).toMatchObject({ applied: false, created: 0 });
  expect(result.problems.length).toBeGreaterThan(0);
  return { d, result };
}

describe("runReviewedLoginLockBackfill: allowed", () => {
  it("locks only the listed clients when the others are excluded", async () => {
    const d = deps();
    const result = await runReviewedLoginLockBackfill(["--apply", "--tenants=off-a,off-b", "--exclude=hand-blocked"], d);
    expect(d.createLocks).toHaveBeenCalledExactlyOnceWith(["off-a", "off-b"]);
    expect(result).toMatchObject({ applied: true, created: 2, problems: [] });
  });

  it("reads the database once, so the check and the write use the same plan", async () => {
    const d = deps();
    await runReviewedLoginLockBackfill(["--apply", "--tenants=off-a", "--exclude=off-b,hand-blocked"], d);
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(d.createLocks).toHaveBeenCalledExactlyOnceWith(["off-a"]);
  });
});

describe("runReviewedLoginLockBackfill: no approval", () => {
  it("writes nothing without --apply, even with a tenant list", async () => {
    for (const args of [[], ["--tenants=off-a"], ["--apply=false", "--tenants=off-a"], ["--APPLY", "--tenants=off-a"]]) {
      const d = deps();
      const result = await runReviewedLoginLockBackfill(args, d);
      expect(d.createLocks).not.toHaveBeenCalled();
      expect(result).toMatchObject({ applied: false, created: 0, problems: [] });
    }
  });

  it("refuses --apply without a tenant list", async () => {
    await expectRefused(["--apply"]);
  });
});

describe("runReviewedLoginLockBackfill: other clients", () => {
  it("refuses when a qualifying client was neither listed nor excluded, and names it", async () => {
    const { d } = await expectRefused(["--apply", "--tenants=off-a", "--exclude=hand-blocked"]);
    expect(logged(d)).toContain("off-b");
  });

  it("refuses when a client newly qualifies after the review", async () => {
    const later: BackfillInput = { tenants: [...input.tenants, tenant("new-off")], users: [...input.users, user("new-off", true)] };
    const { d } = await expectRefused(["--apply", "--tenants=off-a,off-b", "--exclude=hand-blocked"], later);
    expect(logged(d)).toContain("new-off");
  });

  it("ignores a removed link that belongs to another client when classifying", async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      { id: "a", name: "A", status: "connected", loginLock: null },
      { id: "b", name: "B", status: "connected", loginLock: null },
    ]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", tenantId: "a", disabledAt: new Date(0) }]);
    prismaMock.ghlUserLink.findMany.mockResolvedValue([{ userId: "u1", tenantId: "b" }]);
    const read = await readLoginLockBackfillInput();
    expect(read.users).toEqual([{ tenantId: "a", disabled: true, removed: false }]);
  });
});

describe("runReviewedLoginLockBackfill: malformed lists", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["empty list", ["--apply", "--tenants="]],
    ["flag with no value", ["--apply", "--tenants"]],
    ["empty entry", ["--apply", "--tenants=off-a,,off-b", "--exclude=hand-blocked"]],
    ["space in entry", ["--apply", "--tenants=off-a, off-b", "--exclude=hand-blocked"]],
    ["duplicate id", ["--apply", "--tenants=off-a,off-a,off-b", "--exclude=hand-blocked"]],
    ["flag passed twice", ["--apply", "--tenants=off-a", "--tenants=off-b", "--exclude=hand-blocked"]],
    ["unknown id", ["--apply", "--tenants=off-a,off-b,nope", "--exclude=hand-blocked"]],
    ["already locked id", ["--apply", "--tenants=off-a,off-b,locked", "--exclude=hand-blocked"]],
    ["id that needs a decision", ["--apply", "--tenants=off-a,off-b,removed", "--exclude=hand-blocked"]],
    ["id with an active user", ["--apply", "--tenants=off-a,off-b,active", "--exclude=hand-blocked"]],
    ["id both listed and excluded", ["--apply", "--tenants=off-a,off-b,hand-blocked", "--exclude=hand-blocked"]],
    ["excluded id not in the plan", ["--apply", "--tenants=off-a,off-b", "--exclude=hand-blocked,nope"]],
    ["empty exclude", ["--apply", "--tenants=off-a,off-b,hand-blocked", "--exclude="]],
  ])("refuses %s", async (_name, args) => {
    await expectRefused(args);
  });

  it("refuses when a reviewed client stopped qualifying before the apply", async () => {
    const later: BackfillInput = { ...input, users: [...input.users, user("off-b", false)] };
    await expectRefused(["--apply", "--tenants=off-a,off-b", "--exclude=hand-blocked"], later);
  });
});

describe("runReviewedLoginLockBackfill: half-finished removal", () => {
  it("shows the unmarked block on the review line and locks it only when listed", async () => {
    const d = deps();
    await runReviewedLoginLockBackfill([], d);
    expect(logged(d)).toMatch(/hand-blocked.*1 of 1/);

    const excluded = deps();
    await runReviewedLoginLockBackfill(["--apply", "--tenants=off-a,off-b", "--exclude=hand-blocked"], excluded);
    expect(excluded.createLocks.mock.calls[0]?.[0]).not.toContain("hand-blocked");
  });
});

describe("backfill script", () => {
  it("runs the reviewed path, so a bare --apply cannot lock every planned client", () => {
    const script = readFileSync("scripts/backfill-login-locks.ts", "utf8");
    expect(script).toContain("runReviewedLoginLockBackfill");
    expect(script).not.toMatch(/\brunLoginLockBackfill\b/);
  });
});
