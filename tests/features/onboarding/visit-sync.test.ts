import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferVisitSync, emptyUserCounts, runVisitSync, VISIT_SYNC_INTERVAL_MS } from "@/features/onboarding";
import { claimVisitSync } from "../../../src/features/onboarding/db/sync-state";

const prisma = vi.hoisted(() => ({ tenantSyncState: { updateMany: vi.fn(), createMany: vi.fn() } }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => prisma }));

const NOW = new Date("2026-11-22T12:00:00.000Z");
const dbError = (code: string) => Object.assign(new Error("secret detail person@example.test"), { name: "PrismaClientKnownRequestError", code });

function deps(over: Partial<Parameters<typeof runVisitSync>[0]> = {}) {
  return {
    now: () => NOW,
    claim: vi.fn(async () => true),
    syncUsers: vi.fn(async () => ({ ...emptyUserCounts(), created: 2, deactivated: 1 })),
    ...over,
  };
}

describe("runVisitSync", () => {
  let info: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("is set to ten minutes", () => {
    expect(VISIT_SYNC_INTERVAL_MS).toBe(600_000);
  });

  it("claims with a cutoff ten minutes back and syncs only the given tenant", async () => {
    const d = deps();
    await runVisitSync(d, "tenant-a");
    expect(d.claim).toHaveBeenCalledWith("tenant-a", NOW, new Date(NOW.getTime() - 600_000));
    expect(d.syncUsers).toHaveBeenCalledTimes(1);
    expect(d.syncUsers).toHaveBeenCalledWith("tenant-a");
  });

  it("does not sync when the claim is lost", async () => {
    const d = deps({ claim: vi.fn(async () => false) });
    await runVisitSync(d, "tenant-a");
    expect(d.syncUsers).not.toHaveBeenCalled();
  });

  it("skips quietly when the table is missing, without rejecting or syncing", async () => {
    const d = deps({ claim: vi.fn(async () => { throw dbError("P2021"); }) });
    await expect(runVisitSync(d, "tenant-a")).resolves.toBeUndefined();
    expect(d.syncUsers).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain("P2021");
  });

  it("never rejects when the sync fails, and logs no error message", async () => {
    const d = deps({ syncUsers: vi.fn(async () => { throw new Error("person@example.test"); }) });
    await expect(runVisitSync(d, "tenant-a")).resolves.toBeUndefined();
    expect(JSON.stringify(error.mock.calls)).not.toContain("person@example.test");
  });

  it("logs counts only, without the tenant id", async () => {
    await runVisitSync(deps(), "tenant-secret-id");
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("created=2");
    expect(logged).toContain("deactivated=1");
    expect(logged).not.toContain("tenant-secret-id");
  });
});

describe("deferVisitSync", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hands the work to the scheduler and does not run it first", () => {
    const task = vi.fn(async () => {});
    const schedule = vi.fn();
    deferVisitSync(schedule, task);
    expect(schedule).toHaveBeenCalledWith(task);
    expect(task).not.toHaveBeenCalled();
  });

  it("does not throw into the page when the scheduler throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => deferVisitSync(() => { throw new Error("outside a request"); }, async () => {})).not.toThrow();
  });
});

describe("claimVisitSync", () => {
  const cutoff = new Date(NOW.getTime() - VISIT_SYNC_INTERVAL_MS);
  beforeEach(() => {
    prisma.tenantSyncState.updateMany.mockReset();
  });

  it("lets a database error through, so the caller skips the sync", async () => {
    prisma.tenantSyncState.updateMany.mockRejectedValue(dbError("P2021"));
    await expect(claimVisitSync("tenant-a", NOW, cutoff)).rejects.toMatchObject({ code: "P2021" });
  });
});

describe("app layout wiring", () => {
  it("schedules the sync with the session's tenant after the guards", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    const guard = layout.indexOf('redirect("/admin/clients")');
    const call = layout.indexOf("scheduleVisitSync(user.tenantId)");
    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
  });
});
