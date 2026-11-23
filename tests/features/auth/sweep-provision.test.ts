import { beforeEach, describe, expect, it, vi } from "vitest";
import { deactivateGhlUser, provisionGhlUser, type ProvisionDeps } from "@/features/auth";

// Bug sweep 2026-11-23: A4 (null role), H2 (hand block survives) and H4 (block and restore failures).
type User = { id: string; name: string; role: "owner" | "office" | "admin"; tenantId: string | null; disabledAt: Date | null; email: string };
type Link = { tenantId: string; ghlUserId: string; userId: string; deletedAt: Date | null };
const NOW = new Date("2026-11-23T10:00:00.000Z");
const HAND = new Date("2026-11-20T10:00:00.000Z");
const base = { tenantId: "t1", ghlUserId: "g1", email: "pat@example.test", name: "Pat", ghlRole: "user" as string | null, ghlRoleType: "account" };
let users: User[];
let links: Link[];
let deps: ProvisionDeps;

beforeEach(() => {
  users = [{ id: "u1", name: "Pat", role: "owner", tenantId: "t1", disabledAt: null, email: "pat@example.test" }];
  links = [{ tenantId: "t1", ghlUserId: "g1", userId: "u1", deletedAt: null }];
  deps = {
    createUser: vi.fn(async () => ({ userId: "new" })),
    updateUser: vi.fn(async (id, patch) => { Object.assign(users.find((u) => u.id === id) as User, patch); }),
    setDisabled: vi.fn(async (id, disabled) => { (users.find((u) => u.id === id) as User).disabledAt = disabled ? NOW : null; }),
    sendSetPassword: vi.fn(async () => {}),
    randomPassword: () => "x".repeat(40),
    store: {
      findLink: async (t, g) => links.find((l) => l.tenantId === t && l.ghlUserId === g) ?? null,
      findLinkByUserId: async (u) => links.find((l) => l.userId === u) ?? null,
      relinkUser: async (u, t, g) => { for (const l of links) if (l.userId === u) Object.assign(l, { tenantId: t, ghlUserId: g, deletedAt: null }); },
      insertLink: async (t, g, u) => { links.push({ tenantId: t, ghlUserId: g, userId: u, deletedAt: null }); },
      setLinkDeleted: async (t, g, d) => { for (const l of links) if (l.tenantId === t && l.ghlUserId === g) l.deletedAt = d; },
      findUserByEmail: async (e) => users.find((u) => u.email === e) ?? null,
      findUserById: async (id) => users.find((u) => u.id === id) ?? null,
    },
    now: () => NOW,
  };
});

describe("A4: a null HighLevel role never changes a role", () => {
  it("keeps an owner an owner", async () => {
    await provisionGhlUser(deps, { ...base, ghlRole: null });
    expect(users[0].role).toBe("owner");
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it("still updates the name", async () => {
    await provisionGhlUser(deps, { ...base, name: "Pat Q", ghlRole: null });
    expect(users[0]).toMatchObject({ name: "Pat Q", role: "owner" });
  });

  it("keeps the role when an account moves", async () => {
    users[0].tenantId = "old";
    links = [];
    const moveInTransaction = vi.fn(async () => "raced" as const);
    deps.moves = {
      readSnapshot: async () => ({ role: "owner", tenantId: "old", disabledAt: null, linkDeletedAt: null, marker: { tenantId: "old", credentialFingerprint: "f" }, credentials: [{ providerId: "credential", passwordFingerprint: "f" }], sessionCount: 0 }),
      markUnused: async () => {},
      moveInTransaction,
    };
    await provisionGhlUser(deps, { ...base, ghlRole: null, moveProof: { kind: "sync", readSourceEmails: async () => ({ complete: true, emails: new Set(["other@example.test"]) }) } });
    expect(moveInTransaction).toHaveBeenCalledWith(expect.objectContaining({ role: "owner" }), expect.anything());
  });
});

describe("H2: a hand block survives removal and return", () => {
  it("does not mark the link, so the person stays blocked when HighLevel lists them again", async () => {
    users[0].disabledAt = HAND;
    expect(await deactivateGhlUser(deps, "t1", "g1")).toBe(false);
    expect(links[0].deletedAt).toBeNull();
    expect((await provisionGhlUser(deps, base)).outcome).toBe("exists");
    expect(users[0].disabledAt).toEqual(HAND);
  });

  it("stays blocked when they return with a new HighLevel id", async () => {
    users[0].disabledAt = HAND;
    await deactivateGhlUser(deps, "t1", "g1");
    await provisionGhlUser(deps, { ...base, ghlUserId: "g2" });
    expect(users[0].disabledAt).toEqual(HAND);
  });

  it("still restores a person only the sync blocked", async () => {
    await deactivateGhlUser(deps, "t1", "g1");
    expect((await provisionGhlUser(deps, base)).outcome).toBe("restored");
    expect(users[0].disabledAt).toBeNull();
  });
});

describe("H4: a failed step can be retried and never leaves a removed person active", () => {
  it("a failed block leaves the link active, so the next sync blocks them", async () => {
    vi.mocked(deps.setDisabled).mockRejectedValueOnce(new Error("db down"));
    await expect(deactivateGhlUser(deps, "t1", "g1")).rejects.toThrow();
    expect(links[0].deletedAt).toBeNull();
    expect(await deactivateGhlUser(deps, "t1", "g1")).toBe(true);
    expect(users[0].disabledAt).toEqual(NOW);
    expect(links[0].deletedAt).toEqual(NOW);
  });

  it("a failed link mark still leaves the person blocked", async () => {
    deps.store.setLinkDeleted = vi.fn(async () => { throw new Error("db down"); });
    await expect(deactivateGhlUser(deps, "t1", "g1")).rejects.toThrow();
    expect(users[0].disabledAt).toEqual(NOW);
  });

  it("a failed restore keeps the deleted mark, so the next sync retries it", async () => {
    await deactivateGhlUser(deps, "t1", "g1");
    vi.mocked(deps.setDisabled).mockRejectedValueOnce(new Error("db down"));
    await expect(provisionGhlUser(deps, base)).rejects.toThrow();
    expect(links[0].deletedAt).toEqual(NOW);
    expect((await provisionGhlUser(deps, base)).outcome).toBe("restored");
    expect(users[0].disabledAt).toBeNull();
    expect(links[0].deletedAt).toBeNull();
  });

  it("a failed restore after a relink keeps the deleted mark on the new id", async () => {
    await deactivateGhlUser(deps, "t1", "g1");
    vi.mocked(deps.setDisabled).mockRejectedValueOnce(new Error("db down"));
    await expect(provisionGhlUser(deps, { ...base, ghlUserId: "g2" })).rejects.toThrow();
    expect(links[0]).toMatchObject({ ghlUserId: "g2", deletedAt: NOW });
    expect((await provisionGhlUser(deps, { ...base, ghlUserId: "g2" })).outcome).toBe("restored");
    expect(users[0].disabledAt).toBeNull();
  });
});
