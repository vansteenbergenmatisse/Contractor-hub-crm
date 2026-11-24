import { describe, expect, it, vi } from "vitest";
import { planLoginLockBackfill, runLoginLockBackfill, type BackfillInput } from "@/features/admin";

const tenant = (id: string, locked = false) => ({ id, name: id.toUpperCase(), status: "connected" as const, locked });
const user = (tenantId: string, disabled: boolean, removed = false) => ({ tenantId, disabled, removed });

const input: BackfillInput = {
  tenants: [tenant("off"), tenant("active"), tenant("empty"), tenant("locked", true), tenant("removed"), tenant("mixed")],
  users: [
    user("off", true),
    user("off", true),
    user("active", true),
    user("active", false),
    user("locked", true),
    user("removed", true, true),
    user("mixed", true, true),
    user("mixed", true),
  ],
};

describe("planLoginLockBackfill", () => {
  it("locks only clients whose users are all blocked and at least one was not removed from HighLevel", () => {
    expect(planLoginLockBackfill(input).toLock.map((row) => row.id)).toEqual(["off", "mixed"]);
  });

  it("lists a client whose users were all removed for review and never locks it", () => {
    const plan = planLoginLockBackfill(input);
    expect(plan.needsReview.map((row) => row.id)).toEqual(["removed"]);
    expect(plan.toLock.map((row) => row.id)).not.toContain("removed");
  });

  it("is idempotent once the locks exist", () => {
    const after = { ...input, tenants: input.tenants.map((row) => (row.id === "off" || row.id === "mixed" ? { ...row, locked: true } : row)) };
    expect(planLoginLockBackfill(after).toLock).toEqual([]);
  });
});

describe("runLoginLockBackfill", () => {
  const deps = () => ({ read: vi.fn(async () => input), createLocks: vi.fn(async (ids: string[]) => ids.length), log: vi.fn() });

  it("writes nothing by default", async () => {
    const d = deps();
    const result = await runLoginLockBackfill([], d);
    expect(d.createLocks).not.toHaveBeenCalled();
    expect(result).toMatchObject({ applied: false, created: 0 });
  });

  it("treats anything other than the exact flag as a dry run", async () => {
    const d = deps();
    await runLoginLockBackfill(["--apply=false", "apply", "--APPLY"], d);
    expect(d.createLocks).not.toHaveBeenCalled();
  });

  it("creates only the planned locks with --apply", async () => {
    const d = deps();
    const result = await runLoginLockBackfill(["--apply"], d);
    expect(d.createLocks).toHaveBeenCalledExactlyOnceWith(["off", "mixed"]);
    expect(result).toMatchObject({ applied: true, created: 2 });
  });

  it("does not call the writer when there is nothing to lock", async () => {
    const d = { ...deps(), read: vi.fn(async () => ({ tenants: [tenant("active")], users: [user("active", false)] })) };
    await runLoginLockBackfill(["--apply"], d);
    expect(d.createLocks).not.toHaveBeenCalled();
  });
});
