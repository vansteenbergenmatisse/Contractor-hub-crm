import { beforeEach, describe, expect, it, vi } from "vitest";

const table = vi.hoisted(() => ({ findUnique: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({ mailboxPromptDismissal: table }) }));

import { clearDismissal, isDismissed, saveDismissal } from "../../../src/features/mailbox-prompt/db/dismissals";

beforeEach(() => {
  table.findUnique.mockReset();
  table.createMany.mockReset();
  table.deleteMany.mockReset();
});

describe("dismissal table", () => {
  it("reads by the user and tenant key", async () => {
    table.findUnique.mockResolvedValue({ userId: "u1" });
    expect(await isDismissed("u1", "t1")).toBe(true);
    expect(table.findUnique).toHaveBeenCalledWith({ where: { userId_tenantId: { userId: "u1", tenantId: "t1" } }, select: { userId: true } });
  });

  it("reads no row as not dismissed", async () => {
    table.findUnique.mockResolvedValue(null);
    expect(await isDismissed("u1", "t1")).toBe(false);
  });

  it("writes idempotently", async () => {
    table.createMany.mockResolvedValue({ count: 0 });
    await saveDismissal("u1", "t1");
    expect(table.createMany).toHaveBeenCalledWith({ data: [{ userId: "u1", tenantId: "t1" }], skipDuplicates: true });
  });

  it("clears only that user and tenant", async () => {
    table.deleteMany.mockResolvedValue({ count: 1 });
    await clearDismissal("u1", "t1");
    expect(table.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", tenantId: "t1" } });
  });
});
