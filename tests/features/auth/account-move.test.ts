import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { provisionGhlUser, type GhlUserInput, type ProvisionDeps } from "@/features/auth";
import { judgeUnused, readSourceUnproven, type AccountSnapshot, type MoveProof, type MoveStore } from "../../../src/features/auth/api/account-move";

const NOW = new Date("2026-11-22T10:00:00.000Z");
const EMAIL = "pat.private@example.test";
const FP = "fingerprint-1";

const unused = (over: Partial<AccountSnapshot> = {}): AccountSnapshot => ({
  role: "office",
  tenantId: "tenant-a",
  disabledAt: null,
  linkDeletedAt: null,
  marker: { tenantId: "tenant-a", credentialFingerprint: FP },
  credentials: [{ providerId: "credential", passwordFingerprint: FP }],
  sessionCount: 0,
  ...over,
});

type World = {
  user: { id: string; name: string; role: "owner" | "office" | "admin"; tenantId: string | null; disabledAt: Date | null };
  snapshot: AccountSnapshot;
  link: { tenantId: string; ghlUserId: string; userId: string; deletedAt: Date | null } | null;
  sessionsRemoved: number;
};
let world: World;
let moves: MoveStore;
let sent: string[];
let deps: ProvisionDeps;

beforeEach(() => {
  sent = [];
  world = {
    user: { id: "user-1", name: "Pat", role: "office", tenantId: "tenant-a", disabledAt: null },
    snapshot: unused(),
    link: { tenantId: "tenant-a", ghlUserId: "ghl-in-a", userId: "user-1", deletedAt: null },
    sessionsRemoved: 0,
  };
  moves = {
    readSnapshot: vi.fn(async () => world.snapshot),
    markUnused: vi.fn(async () => {}),
    // Behaves like the real transaction: re-verifies, and the marker can be claimed only once.
    moveInTransaction: vi.fn(async (input, verify) => {
      const refused = verify(world.snapshot, input.fromTenantId);
      if (refused) return refused;
      world.snapshot = { ...world.snapshot, marker: null, tenantId: input.toTenantId, role: input.role, sessionCount: 0, disabledAt: null };
      world.user = { ...world.user, tenantId: input.toTenantId, role: input.role, disabledAt: null };
      world.link = { tenantId: input.toTenantId, ghlUserId: input.ghlUserId, userId: input.userId, deletedAt: null };
      world.sessionsRemoved += 1;
      return "moved" as const;
    }),
  };
  deps = {
    createUser: vi.fn(async () => ({ userId: "new-user" })),
    updateUser: vi.fn(async () => {}),
    setDisabled: vi.fn(async () => {}),
    sendSetPassword: vi.fn(async (email: string) => { sent.push(email); }),
    randomPassword: () => "x".repeat(40),
    now: () => NOW,
    moves,
    store: {
      findLink: vi.fn(async () => null),
      findLinkByUserId: vi.fn(async () => world.link),
      relinkUser: vi.fn(async () => {}),
      insertLink: vi.fn(async () => {}),
      setLinkDeleted: vi.fn(async () => {}),
      findUserByEmail: vi.fn(async () => world.user),
      findUserById: vi.fn(async () => world.user),
    },
  } as ProvisionDeps;
});
afterEach(() => vi.restoreAllMocks());

const inB = (moveProof?: MoveProof, over: Partial<GhlUserInput> = {}): GhlUserInput => ({
  tenantId: "tenant-b", ghlUserId: "ghl-in-b", email: EMAIL, name: "Pat", ghlRole: "admin", ghlRoleType: "account", moveProof, ...over,
});
const aLetGo = async () => ({ complete: true as const, emails: new Set(["someone@example.test"]) });
const embed: MoveProof = { kind: "embed", readSourceEmails: aLetGo };
const embedWith = (read: MoveProof["readSourceEmails"]): MoveProof => ({ kind: "embed", readSourceEmails: read });
const syncProof = (read: MoveProof["readSourceEmails"]): MoveProof => ({ kind: "sync", readSourceEmails: read });

describe("judgeUnused: never used must be proven", () => {
  it("accepts a marked account with its first credential and no session", () => {
    expect(judgeUnused(unused(), "tenant-a")).toBeNull();
  });
  it.each<[string, Partial<AccountSnapshot>, string]>([
    ["no marker (older account: unprovable)", { marker: null }, "unprovable"],
    ["a marker from another tenant", { marker: { tenantId: "tenant-x", credentialFingerprint: FP } }, "unprovable"],
    ["a password that was set", { credentials: [{ providerId: "credential", passwordFingerprint: "changed" }] }, "used"],
    ["no credential row", { credentials: [] }, "unprovable"],
    ["a second sign-in method", { credentials: [{ providerId: "credential", passwordFingerprint: FP }, { providerId: "google", passwordFingerprint: null }] }, "used"],
    ["a credential with no password", { credentials: [{ providerId: "credential", passwordFingerprint: null }] }, "used"],
    ["a session row", { sessionCount: 1 }, "used"],
    ["a Forge Forward admin", { role: "admin", tenantId: null }, "admin_account"],
    ["an admin even with a marker", { role: "admin" }, "admin_account"],
    ["an account in another tenant by now", { tenantId: "tenant-x" }, "raced"],
    ["a user turned off by hand", { disabledAt: NOW, linkDeletedAt: null }, "disabled"],
    ["a user who looks sync-blocked", { disabledAt: NOW, linkDeletedAt: NOW }, "disabled"],
    ["a link marked deleted", { disabledAt: null, linkDeletedAt: NOW }, "disabled"],
  ])("refuses %s", (_label, over, reason) => {
    expect(judgeUnused(unused(over), "tenant-a")).toBe(reason);
  });
});

describe("embed proof", () => {
  it("moves an unused account to B with B's role, and sends no mail", async () => {
    const result = await provisionGhlUser(deps, inB(embed));
    expect(result).toEqual({ outcome: "moved", userId: "user-1" });
    expect(world.user).toMatchObject({ tenantId: "tenant-b", role: "owner" });
    expect(world.link).toMatchObject({ tenantId: "tenant-b", ghlUserId: "ghl-in-b" });
    expect(sent).toEqual([]);
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("never moves a used account", async () => {
    world.snapshot = unused({ sessionCount: 1 });
    expect((await provisionGhlUser(deps, inB(embed))).outcome).toBe("skipped_conflict");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
    expect(world.user.tenantId).toBe("tenant-a");
  });

  it("never moves a Forge Forward admin", async () => {
    world.user = { ...world.user, role: "admin", tenantId: null };
    world.snapshot = unused({ role: "admin", tenantId: null });
    expect((await provisionGhlUser(deps, inB(embed))).outcome).toBe("skipped_conflict");
    expect(moves.readSnapshot).not.toHaveBeenCalled();
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("treats an account it cannot prove unused as used", async () => {
    world.snapshot = unused({ marker: null });
    expect((await provisionGhlUser(deps, inB(embed))).outcome).toBe("skipped_conflict");
    expect(world.user.tenantId).toBe("tenant-a");
  });

  it("does not move when the proof cannot be read (table missing or database error)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(moves.readSnapshot).mockRejectedValueOnce(Object.assign(new Error("relation missing"), { code: "P2021" }));
    expect((await provisionGhlUser(deps, inB(embed))).outcome).toBe("skipped_conflict");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("does not move when the transaction fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(moves.moveInTransaction).mockRejectedValueOnce(new Error("serialization"));
    expect((await provisionGhlUser(deps, inB(embed))).outcome).toBe("skipped_conflict");
  });

  it("moves once under two concurrent attempts", async () => {
    const results = await Promise.all([provisionGhlUser(deps, inB(embed)), provisionGhlUser(deps, inB(embed))]);
    expect(results.filter((r) => r.outcome === "moved")).toHaveLength(1);
    expect(world.sessionsRemoved).toBe(1);
  });

  it("cannot be moved back: a moved account has no marker any more", async () => {
    await provisionGhlUser(deps, inB(embed));
    world.user = { ...world.user };
    const back = await provisionGhlUser(deps, { ...inB(embed), tenantId: "tenant-a", ghlUserId: "ghl-in-a" });
    expect(back.outcome).toBe("skipped_conflict");
    expect(world.user.tenantId).toBe("tenant-b");
  });
});

describe("embed proof must not pull an account out of a client that still has it", () => {
  it("refuses while A's list still has the email", async () => {
    const read = async () => ({ complete: true as const, emails: new Set([EMAIL]) });
    expect(await provisionGhlUser(deps, inB(embedWith(read)))).toEqual({ outcome: "skipped_conflict", userId: null, reason: "source_still_lists" });
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("refuses when A's list cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const read = async () => { throw new Error("HighLevel down"); };
    expect(await provisionGhlUser(deps, inB(embedWith(read)))).toEqual({ outcome: "skipped_conflict", userId: null, reason: "source_unreadable" });
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("refuses when A's list is not proven complete: absence from it proves nothing", async () => {
    expect((await provisionGhlUser(deps, inB(embedWith(async () => ({ complete: false }))))).reason).toBe("source_unreadable");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("the real reader never claims a complete list today, so nothing moves", async () => {
    expect(await readSourceUnproven("tenant-a")).toEqual({ complete: false });
    expect((await provisionGhlUser(deps, inB(embedWith(readSourceUnproven)))).outcome).toBe("skipped_conflict");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });
});

describe("sync proof", () => {
  it("moves only when A's complete list no longer has the email", async () => {
    const read = vi.fn(async () => ({ complete: true as const, emails: new Set(["someone@example.test"]) }));
    expect((await provisionGhlUser(deps, inB(syncProof(read)))).outcome).toBe("moved");
    expect(read).toHaveBeenCalledWith("tenant-a");
  });

  it("compares the address in lower case", async () => {
    const read = async () => ({ complete: true as const, emails: new Set([EMAIL]) });
    expect((await provisionGhlUser(deps, inB(syncProof(read), { email: EMAIL.toUpperCase() }))).outcome).toBe("skipped_conflict");
  });

  it("does not move while A still lists the email", async () => {
    const read = async () => ({ complete: true as const, emails: new Set([EMAIL]) });
    expect((await provisionGhlUser(deps, inB(syncProof(read)))).outcome).toBe("skipped_conflict");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("does not move on a failed read of A", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const read = async () => { throw new Error("HighLevel down"); };
    expect((await provisionGhlUser(deps, inB(syncProof(read)))).outcome).toBe("skipped_conflict");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("does not move on a partial read of A", async () => {
    const read = async () => ({ complete: false as const });
    expect((await provisionGhlUser(deps, inB(syncProof(read)))).outcome).toBe("skipped_conflict");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("does not treat an empty list of A as proof", async () => {
    const read = async () => ({ complete: true as const, emails: new Set<string>() });
    expect((await provisionGhlUser(deps, inB(syncProof(read)))).outcome).toBe("skipped_conflict");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });

  it("does not read HighLevel for an account that cannot move anyway", async () => {
    world.snapshot = unused({ sessionCount: 2 });
    const read = vi.fn(async () => ({ complete: true as const, emails: new Set<string>(["x@example.test"]) }));
    await provisionGhlUser(deps, inB(syncProof(read)));
    expect(read).not.toHaveBeenCalled();
  });
});

describe("paths without proof", () => {
  it("does not move without a proof", async () => {
    expect((await provisionGhlUser(deps, inB())).outcome).toBe("skipped_conflict");
    expect(moves.readSnapshot).not.toHaveBeenCalled();
  });

  it("never moves on a no-restore path, even when handed a proof", async () => {
    expect((await provisionGhlUser(deps, inB(embed, { mayRestore: false }))).outcome).toBe("skipped_conflict");
    expect(moves.moveInTransaction).not.toHaveBeenCalled();
  });
});

describe("audit line", () => {
  it("holds a reason code and no personal data", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await provisionGhlUser(deps, inB(embed));
    world.snapshot = unused({ sessionCount: 1 });
    world.user = { ...world.user, tenantId: "tenant-a" };
    await provisionGhlUser(deps, inB(embed));
    const lines = info.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("account_move"));
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { audit: "account_move", outcome: "moved", path: "embed" },
      { audit: "account_move", outcome: "conflict", path: "embed", reason: "used" },
    ]);
    for (const secret of [EMAIL, "user-1", "tenant-a", "tenant-b", "ghl-in-b", "Pat"]) expect(lines.join("")).not.toContain(secret);
  });
});

describe("the unused marker", () => {
  it("is written for an account the sync creates, before the mail", async () => {
    vi.mocked(deps.store.findUserByEmail).mockResolvedValue(null);
    await provisionGhlUser(deps, inB());
    expect(moves.markUnused).toHaveBeenCalledWith("new-user", "tenant-b");
    expect(vi.mocked(moves.markUnused).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.sendSetPassword).mock.invocationCallOrder[0]);
  });

  it("a failed marker keeps the account, which then simply counts as used", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(deps.store.findUserByEmail).mockResolvedValue(null);
    vi.mocked(moves.markUnused).mockRejectedValueOnce(new Error("table missing"));
    expect((await provisionGhlUser(deps, inB())).outcome).toBe("created");
  });
});
