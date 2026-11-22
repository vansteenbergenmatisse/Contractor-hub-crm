import { beforeEach, describe, expect, it, vi } from "vitest";
import { deactivateGhlUser, mapGhlRole, provisionGhlUser, type ProvisionDeps } from "@/features/auth";

// In-memory stand-ins for the user table and the link table.
type User = { id: string; name: string; role: "owner" | "office" | "admin"; tenantId: string | null; disabledAt: Date | null; email: string };
let users: User[];
let links: Array<{ tenantId: string; ghlUserId: string; userId: string; deletedAt: Date | null }>;
let sent: string[];
let deps: ProvisionDeps;
const NOW = new Date("2026-11-22T10:00:00.000Z");

beforeEach(() => {
  users = [];
  links = [];
  sent = [];
  let n = 0;
  deps = {
    createUser: vi.fn(async (input) => {
      if (users.some((u) => u.email === input.email)) throw new Error("duplicate");
      const user: User = { id: `u${(n += 1)}`, name: input.name, role: input.role as User["role"], tenantId: input.tenantId, disabledAt: null, email: input.email };
      users.push(user);
      return { userId: user.id };
    }),
    updateUser: vi.fn(async (id, patch) => { Object.assign(users.find((u) => u.id === id) as User, patch); }),
    setDisabled: vi.fn(async (id, disabled) => { (users.find((u) => u.id === id) as User).disabledAt = disabled ? NOW : null; }),
    sendSetPassword: vi.fn(async (email) => { sent.push(email); }),
    randomPassword: () => "x".repeat(40),
    store: {
      findLink: async (t, g) => links.find((l) => l.tenantId === t && l.ghlUserId === g) ?? null,
      findLinkByUserId: async (u) => links.find((l) => l.userId === u) ?? null,
      relinkUser: async (u, t, g) => { for (const l of links) if (l.userId === u) { l.tenantId = t; l.ghlUserId = g; l.deletedAt = null; } },
      insertLink: async (t, g, u) => { if (!links.some((l) => l.tenantId === t && l.ghlUserId === g)) links.push({ tenantId: t, ghlUserId: g, userId: u, deletedAt: null }); },
      setLinkDeleted: async (t, g, d) => { for (const l of links) if (l.tenantId === t && l.ghlUserId === g) l.deletedAt = d; },
      findUserByEmail: async (e) => users.find((u) => u.email === e) ?? null,
      findUserById: async (id) => users.find((u) => u.id === id) ?? null,
    },
    now: () => NOW,
  };
});

const base = { tenantId: "t1", ghlUserId: "g1", email: "Pat@Example.TEST", name: "Pat Lee", ghlRole: "user", ghlRoleType: "account" };

describe("mapGhlRole", () => {
  it("maps admin to owner and everything else to office, never to our admin role", () => {
    expect(mapGhlRole("admin")).toBe("owner");
    expect(mapGhlRole("ADMIN")).toBe("owner");
    expect(mapGhlRole("user")).toBe("office");
    expect(mapGhlRole(null)).toBe("office");
    expect(mapGhlRole("owner")).toBe("office");
  });
});

describe("provisionGhlUser", () => {
  it("creates a user with the mapped role, lower-cased email, a link and one set-password mail", async () => {
    const result = await provisionGhlUser(deps, { ...base, ghlRole: "admin" });
    expect(result.outcome).toBe("created");
    expect(users).toEqual([expect.objectContaining({ email: "pat@example.test", role: "owner", tenantId: "t1", name: "Pat Lee" })]);
    expect(links).toHaveLength(1);
    expect(sent).toEqual(["pat@example.test"]);
    expect(deps.createUser).toHaveBeenCalledWith(expect.objectContaining({ password: "x".repeat(40) }));
  });

  it("never creates the platform admin role", async () => {
    for (const role of ["admin", "user", "owner", null]) {
      users = []; links = [];
      await provisionGhlUser(deps, { ...base, ghlRole: role });
      expect(users[0].role === "owner" || users[0].role === "office").toBe(true);
    }
  });

  it("is idempotent: a second run creates nothing and sends no second mail", async () => {
    await provisionGhlUser(deps, base);
    const again = await provisionGhlUser(deps, base);
    expect(again.outcome).toBe("exists");
    expect(users).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("skips an agency-level user (Forge Forward staff)", async () => {
    const result = await provisionGhlUser(deps, { ...base, ghlRoleType: "agency" });
    expect(result).toEqual({ outcome: "skipped_agency", userId: null });
    expect(users).toHaveLength(0);
  });

  it("links an existing user of the same tenant without a mail", async () => {
    users.push({ id: "u9", name: "Pat", role: "owner", tenantId: "t1", disabledAt: null, email: "pat@example.test" });
    const result = await provisionGhlUser(deps, base);
    expect(result).toEqual({ outcome: "linked", userId: "u9" });
    expect(sent).toHaveLength(0);
    expect(links).toHaveLength(1);
  });

  it("skips an email that belongs to another tenant or to an admin", async () => {
    users.push({ id: "u9", name: "Pat", role: "owner", tenantId: "other", disabledAt: null, email: "pat@example.test" });
    expect((await provisionGhlUser(deps, base)).outcome).toBe("skipped_conflict");
    users[0] = { ...users[0], role: "admin", tenantId: null };
    expect((await provisionGhlUser(deps, base)).outcome).toBe("skipped_conflict");
    expect(links).toHaveLength(0);
  });

  it("survives a race: the other writer created the user first", async () => {
    (deps.createUser as ReturnType<typeof vi.fn>).mockImplementationOnce(async (input) => {
      users.push({ id: "u7", name: "Pat", role: "owner", tenantId: input.tenantId, disabledAt: null, email: input.email });
      throw new Error("duplicate");
    });
    const result = await provisionGhlUser(deps, base);
    expect(result).toEqual({ outcome: "linked", userId: "u7" });
  });

  it("keeps the user when the mail fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    (deps.sendSetPassword as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("resend down"));
    expect((await provisionGhlUser(deps, base)).outcome).toBe("created");
    expect(users).toHaveLength(1);
  });

  it("updates name and role of a known user, and restores a deactivated one", async () => {
    await provisionGhlUser(deps, base);
    await provisionGhlUser(deps, { ...base, name: "Pat Q", ghlRole: "admin" });
    expect(users[0]).toMatchObject({ name: "Pat Q", role: "owner" });
    await deactivateGhlUser(deps, "t1", "g1");
    expect(users[0].disabledAt).not.toBeNull();
    const back = await provisionGhlUser(deps, base);
    expect(back.outcome).toBe("restored");
    expect(users[0].disabledAt).toBeNull();
    expect(links[0].deletedAt).toBeNull();
  });

  it("never lowers an admin to office on a name update", async () => {
    users.push({ id: "u1", name: "A", role: "admin", tenantId: null, disabledAt: null, email: "a@x.test" });
    links.push({ tenantId: "t1", ghlUserId: "g1", userId: "u1", deletedAt: null });
    await provisionGhlUser(deps, base);
    expect(users[0].role).toBe("admin");
  });
});

describe("deactivateGhlUser", () => {
  it("blocks the user and marks the link, once", async () => {
    await provisionGhlUser(deps, base);
    expect(await deactivateGhlUser(deps, "t1", "g1")).toBe(true);
    expect(await deactivateGhlUser(deps, "t1", "g1")).toBe(false);
    expect(links[0].deletedAt).toEqual(NOW);
    expect(deps.setDisabled).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an unknown user", async () => {
    expect(await deactivateGhlUser(deps, "t1", "nope")).toBe(false);
  });
});

describe("provisionGhlUser: hardening after the security review", () => {
  it("moves the link when HighLevel re-created a person with a new id, and undoes the sync's block", async () => {
    await provisionGhlUser(deps, base);
    await deactivateGhlUser(deps, "t1", "g1"); // the old id vanished from HighLevel
    expect(users[0].disabledAt).not.toBeNull();
    const result = await provisionGhlUser(deps, { ...base, ghlUserId: "g2" });
    expect(result).toEqual({ outcome: "restored", userId: users[0].id });
    expect(links).toEqual([expect.objectContaining({ ghlUserId: "g2", deletedAt: null })]);
    expect(users[0].disabledAt).toBeNull();
    expect(users).toHaveLength(1);
  });

  it("does not re-enable a user an admin turned off by hand when the link was never marked deleted", async () => {
    await provisionGhlUser(deps, base);
    users[0].disabledAt = NOW; // manual "Turn off login"
    expect((await provisionGhlUser(deps, base)).outcome).toBe("exists");
    expect(users[0].disabledAt).toEqual(NOW);
  });

  it.each(["not-an-email", "a@b", "a b@x.test", `${"a".repeat(250)}@x.test`, ""])("skips the malformed address %j: no user, no mail", async (email) => {
    const result = await provisionGhlUser(deps, { ...base, email });
    expect(result.outcome).toBe("skipped_invalid");
    expect(users).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("reports capped and creates nothing when the caller's per-pass limit is reached", async () => {
    const result = await provisionGhlUser(deps, { ...base, allowCreate: false });
    expect(result).toEqual({ outcome: "capped", userId: null });
    expect(users).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("still links or finds existing users when creation is capped", async () => {
    users.push({ id: "u9", name: "Pat", role: "owner", tenantId: "t1", disabledAt: null, email: "pat@example.test" });
    expect((await provisionGhlUser(deps, { ...base, allowCreate: false })).outcome).toBe("linked");
  });

  it("handles a plus-address and mixed case as the same mailbox it was given (no merging)", async () => {
    await provisionGhlUser(deps, { ...base, email: "Pat+crm@Example.test" });
    expect(users[0].email).toBe("pat+crm@example.test");
  });
});
