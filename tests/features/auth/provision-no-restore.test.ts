import { describe, expect, it, vi } from "vitest";
import { provisionGhlUser, type GhlUserInput, type ProvisionDeps } from "@/features/auth";

const BLOCKED_AT = new Date("2026-11-22T10:00:00.000Z");
const user = { id: "user-1", name: "Pat", email: "pat@x.test", role: "office", tenantId: "t1", disabledAt: BLOCKED_AT };
const input: GhlUserInput = { tenantId: "t1", ghlUserId: "g1", email: "pat@x.test", name: "New Name", ghlRole: "admin", ghlRoleType: "account" };

function deps(over: Partial<ProvisionDeps["store"]> = {}): ProvisionDeps {
  return {
    createUser: vi.fn(async () => ({ userId: "new" })),
    updateUser: vi.fn(async () => {}),
    setDisabled: vi.fn(async () => {}),
    sendSetPassword: vi.fn(async () => {}),
    randomPassword: () => "random",
    now: () => BLOCKED_AT,
    store: {
      findLink: vi.fn(async () => null),
      findLinkByUserId: vi.fn(async () => null),
      relinkUser: vi.fn(async () => {}),
      insertLink: vi.fn(async () => {}),
      setLinkDeleted: vi.fn(async () => {}),
      findUserByEmail: vi.fn(async () => null),
      findUserById: vi.fn(async () => user),
      ...over,
    } as ProvisionDeps["store"],
  };
}

const blockedLink = { userId: "user-1", deletedAt: BLOCKED_AT };
const oldLink = (deletedAt: Date | null) => ({ userId: "user-1", deletedAt, tenantId: "t1", ghlUserId: "g-old" });

describe("provisionGhlUser with mayRestore false", () => {
  it("leaves a blocked linked user blocked and unchanged", async () => {
    const d = deps({ findLink: vi.fn(async () => blockedLink) } as never);
    const result = await provisionGhlUser(d, { ...input, mayRestore: false });
    expect(result).toEqual({ outcome: "skipped_removed", userId: null });
    expect(d.setDisabled).not.toHaveBeenCalled();
    expect(d.store.setLinkDeleted).not.toHaveBeenCalled();
    expect(d.updateUser).not.toHaveBeenCalled();
  });

  it.each([["blocked", BLOCKED_AT], ["active", null]])("does not relink a re-created person whose old link is %s", async (_label, deletedAt) => {
    const d = deps({ findUserByEmail: vi.fn(async () => user), findLinkByUserId: vi.fn(async () => oldLink(deletedAt)) } as never);
    const result = await provisionGhlUser(d, { ...input, mayRestore: false });
    expect(result).toEqual({ outcome: "skipped_removed", userId: null });
    expect(d.store.relinkUser).not.toHaveBeenCalled();
    expect(d.setDisabled).not.toHaveBeenCalled();
  });

  it("does not relink in the create race either", async () => {
    const findUserByEmail = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(user);
    const d = deps({ findUserByEmail, findLinkByUserId: vi.fn(async () => oldLink(BLOCKED_AT)) } as never);
    vi.mocked(d.createUser).mockRejectedValueOnce(new Error("duplicate"));
    const result = await provisionGhlUser(d, { ...input, mayRestore: false });
    expect(result.outcome).toBe("skipped_removed");
    expect(d.store.relinkUser).not.toHaveBeenCalled();
    expect(d.setDisabled).not.toHaveBeenCalled();
  });
});

describe("provisionGhlUser by default (webhook and cron)", () => {
  it("still restores a blocked linked user", async () => {
    const d = deps({ findLink: vi.fn(async () => blockedLink) } as never);
    expect((await provisionGhlUser(d, input)).outcome).toBe("restored");
    expect(d.setDisabled).toHaveBeenCalledWith("user-1", false);
  });

  it("still relinks and unblocks a re-created person", async () => {
    const d = deps({ findUserByEmail: vi.fn(async () => user), findLinkByUserId: vi.fn(async () => oldLink(BLOCKED_AT)) } as never);
    expect((await provisionGhlUser(d, input)).outcome).toBe("restored");
    expect(d.store.relinkUser).toHaveBeenCalledWith("user-1", "t1", "g1");
    expect(d.setDisabled).toHaveBeenCalledWith("user-1", false);
  });
});
