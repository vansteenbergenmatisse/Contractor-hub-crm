import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HighLevelUser } from "@/features/highlevel";
import { createMailCap, MAX_SET_PASSWORD_MAILS_PER_TENANT_PER_DAY, syncTenantUsers, syncUsersOnVisit, type UserSyncDeps } from "@/features/onboarding";
import { claimVisitSync, reserveSetPasswordMail } from "../../../src/features/onboarding/db/sync-state";

const prisma = vi.hoisted(() => ({ tenantSyncState: { updateMany: vi.fn(), createMany: vi.fn(), create: vi.fn() } }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => prisma }));

const NOW = new Date("2026-11-22T12:00:00.000Z");
const DAY = new Date("2026-11-22T00:00:00.000Z");
const ghl = (id: string): HighLevelUser => ({ id, email: `${id}@x.test`, name: id, deleted: false, roleType: "account", role: "user", locationIds: [] });

function userSync(linked: string[]): UserSyncDeps {
  return {
    provision: vi.fn(async () => ({ outcome: "exists" as const, userId: "u" })),
    deactivate: vi.fn(async () => true),
    activeLinks: vi.fn(async () => linked.map((ghlUserId) => ({ ghlUserId, userId: `user-${ghlUserId}` }))),
  };
}

describe("who may block users", () => {
  it("a visit sync with a partial list blocks nobody", async () => {
    const deps = userSync(["a", "b", "c"]);
    const counts = await syncUsersOnVisit(deps, "tenant-a", [ghl("a")]);
    expect(deps.deactivate).not.toHaveBeenCalled();
    expect(counts.deactivated).toBe(0);
  });

  it("a visit sync skips a listed-as-deleted user without blocking them", async () => {
    const deps = userSync(["a", "b"]);
    await syncUsersOnVisit(deps, "tenant-a", [ghl("a"), { ...ghl("b"), deleted: true }]);
    expect(deps.deactivate).not.toHaveBeenCalled();
  });

  it("the webhook and cron default still blocks a user who is gone", async () => {
    const deps = userSync(["a", "b"]);
    await syncTenantUsers(deps, "tenant-a", [ghl("a")]);
    expect(deps.deactivate).toHaveBeenCalledWith("tenant-a", "b");
  });

  it("the visit wiring uses the path that cannot block", () => {
    const source = readFileSync(join(process.cwd(), "src/features/onboarding/api/instance.ts"), "utf8");
    const visit = source.slice(source.indexOf("export function scheduleVisitSync"), source.indexOf("// POST or GET /api/integrations/sync."));
    expect(visit).toContain("syncUsersOnVisit(");
    expect(visit).not.toContain("syncTenantUsers(");
  });
});

describe("createMailCap", () => {
  let info: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const cap = (over: Partial<Parameters<typeof createMailCap>[0]> = {}) => {
    const deps = { now: () => NOW, gateOpen: () => true, reserve: vi.fn(async () => true), ...over };
    return { deps, mail: createMailCap(deps) };
  };

  it("is 50 a day", () => {
    expect(MAX_SET_PASSWORD_MAILS_PER_TENANT_PER_DAY).toBe(50);
  });

  it("reserves for the tenant's UTC day, then sends", async () => {
    const { deps, mail } = cap();
    const send = vi.fn(async () => {});
    await mail.send("tenant-a", send);
    expect(deps.reserve).toHaveBeenCalledWith("tenant-a", DAY, 50);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("over the cap: no mail, no throw (the account stays), and the skipped count is logged", async () => {
    const { mail } = cap({ reserve: vi.fn(async () => false) });
    const send = vi.fn(async () => {});
    await expect(mail.send("tenant-secret-id", send)).resolves.toBeUndefined();
    await mail.send("tenant-secret-id", send);
    expect(send).not.toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("skipped=2");
    expect(logged).not.toContain("tenant-secret-id");
  });

  it("no reservation possible (table missing): fails closed, no mail, no throw", async () => {
    const failure = Object.assign(new Error("person@example.test"), { code: "P2021" });
    const { mail } = cap({ reserve: vi.fn(async () => { throw failure; }) });
    const send = vi.fn(async () => {});
    await expect(mail.send("tenant-a", send)).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).toContain("P2021");
    expect(JSON.stringify(error.mock.calls)).not.toContain("person@example.test");
  });

  it("with the gate off it spends no budget and leaves the decision to the existing gate", async () => {
    const { deps, mail } = cap({ gateOpen: () => false });
    const send = vi.fn(async () => {});
    await mail.send("tenant-a", send);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });
});

describe("reserveSetPasswordMail", () => {
  beforeEach(() => {
    prisma.tenantSyncState.updateMany.mockReset();
    prisma.tenantSyncState.createMany.mockReset().mockResolvedValue({ count: 0 });
  });

  it("makes sure the row exists without a failing insert, rolls the day, then counts atomically under the cap", async () => {
    prisma.tenantSyncState.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await expect(reserveSetPasswordMail("tenant-a", DAY, 50)).resolves.toBe(true);
    expect(prisma.tenantSyncState.createMany).toHaveBeenCalledWith({ data: [{ tenantId: "tenant-a" }], skipDuplicates: true });
    expect(prisma.tenantSyncState.updateMany).toHaveBeenNthCalledWith(1, {
      where: { tenantId: "tenant-a", OR: [{ mailDay: null }, { mailDay: { lt: DAY } }] },
      data: { mailDay: DAY, mailCount: 0 },
    });
    expect(prisma.tenantSyncState.updateMany).toHaveBeenNthCalledWith(2, {
      where: { tenantId: "tenant-a", mailDay: { gte: DAY }, mailCount: { lt: 50 } },
      data: { mailCount: { increment: 1 } },
    });
  });

  it("is refused at the cap", async () => {
    prisma.tenantSyncState.updateMany.mockResolvedValue({ count: 0 });
    await expect(reserveSetPasswordMail("tenant-a", DAY, 50)).resolves.toBe(false);
  });
});

describe("claimVisitSync without a failing insert", () => {
  const cutoff = new Date(NOW.getTime() - 600_000);
  beforeEach(() => {
    prisma.tenantSyncState.updateMany.mockReset();
    prisma.tenantSyncState.createMany.mockReset();
    prisma.tenantSyncState.create.mockReset();
  });

  it("wins on a stale or never-claimed row, scoped to the tenant", async () => {
    prisma.tenantSyncState.updateMany.mockResolvedValue({ count: 1 });
    await expect(claimVisitSync("tenant-a", NOW, cutoff)).resolves.toBe(true);
    expect(prisma.tenantSyncState.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", OR: [{ lastClaimedAt: null }, { lastClaimedAt: { lt: cutoff } }] },
      data: { lastClaimedAt: NOW },
    });
    expect(prisma.tenantSyncState.createMany).not.toHaveBeenCalled();
  });

  it("wins by inserting the first row", async () => {
    prisma.tenantSyncState.updateMany.mockResolvedValue({ count: 0 });
    prisma.tenantSyncState.createMany.mockResolvedValue({ count: 1 });
    await expect(claimVisitSync("tenant-a", NOW, cutoff)).resolves.toBe(true);
    expect(prisma.tenantSyncState.createMany).toHaveBeenCalledWith({ data: [{ tenantId: "tenant-a", lastClaimedAt: NOW }], skipDuplicates: true });
  });

  it("loses inside the window without any failing statement", async () => {
    prisma.tenantSyncState.updateMany.mockResolvedValue({ count: 0 });
    prisma.tenantSyncState.createMany.mockResolvedValue({ count: 0 });
    await expect(claimVisitSync("tenant-a", NOW, cutoff)).resolves.toBe(false);
    expect(prisma.tenantSyncState.create).not.toHaveBeenCalled();
  });
});
