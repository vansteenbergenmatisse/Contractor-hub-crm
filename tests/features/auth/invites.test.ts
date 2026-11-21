import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createInviteService, hashInviteCode, InviteError, type InviteServiceDeps } from "@/features/auth";

// Invite create / preview / accept with fake stores. The real database is only touched in db/.
const NOW = new Date("2026-11-21T12:00:00Z");
const TENANT = { id: "t1", name: "Tenant One", locationId: "loc_1", companyId: "co_1", status: "connected" as const };

type Row = {
  id: string;
  tenantId: string;
  email: string;
  role: "owner" | "office";
  hlUserId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdById: string | null;
};

let rows: Row[];
let users: string[];
let sent: { to: string; text: string }[];
let created: Parameters<InviteServiceDeps["createUser"]>[0][];
let deps: InviteServiceDeps;

beforeEach(() => {
  rows = [];
  users = [];
  sent = [];
  created = [];
  deps = {
    now: () => NOW,
    newCode: () => "CODE-abc",
    appUrl: "https://crm.example.test",
    emailSender: { send: async (m) => (sent.push({ to: m.to, text: m.text }), { delivered: false }) },
    checkEligibility: async () => ({ eligible: true, hlUserId: "hl_1" }),
    store: {
      findTenant: async (id) => (id === TENANT.id ? TENANT : null),
      emailTaken: async (email) => users.includes(email),
      insertInvite: async (input) => {
        const row = { ...input, id: `inv_${rows.length + 1}`, usedAt: null } as Row;
        rows.push(row);
        return { id: row.id };
      },
      findInviteByCodeHash: async (hash) => rows.find((r) => r.codeHash === hash) ?? null,
      claimInvite: async (id, at) => {
        const row = rows.find((r) => r.id === id);
        if (!row || row.usedAt || row.expiresAt <= at) return false;
        row.usedAt = at;
        return true;
      },
      releaseInvite: async (id) => {
        const row = rows.find((r) => r.id === id);
        if (row) row.usedAt = null;
      },
      deleteInvite: async (id) => {
        rows = rows.filter((r) => r.id !== id);
      },
    },
    createUser: async (input) => {
      created.push(input);
      users.push(input.email);
      return { userId: "u1" };
    },
  };
});

const make = (over: Partial<Parameters<ReturnType<typeof createInviteService>["createInvite"]>[0]> = {}) =>
  createInviteService(deps).createInvite({ tenantId: "t1", email: "Pat@Example.test", role: "owner", createdById: "admin_1", ...over });

const codeOf = (error: unknown) => (error instanceof InviteError ? error.code : "other");
const failure = async (promise: Promise<unknown>) => promise.then(() => "ok", codeOf);

describe("createInvite", () => {
  it("stores only the hash of the code, emails the link and returns it", async () => {
    const result = await make();
    expect(result.link).toBe("https://crm.example.test/invite/CODE-abc");
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).toBe(createHash("sha256").update("CODE-abc").digest("hex"));
    expect(JSON.stringify(rows)).not.toContain("CODE-abc");
    expect(rows[0]).toMatchObject({ email: "pat@example.test", role: "owner", hlUserId: "hl_1", tenantId: "t1", createdById: "admin_1" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("pat@example.test");
    expect(sent[0].text).toContain("/invite/CODE-abc");
    expect(sent[0].text).toContain("3 days");
  });

  it("expires after 72 hours", async () => {
    await make();
    expect(rows[0].expiresAt.getTime()).toBe(NOW.getTime() + 3 * 24 * 3600 * 1000);
  });

  it("refuses the admin role (admins are created by script, never by invite)", async () => {
    expect(await failure(make({ role: "admin" as never }))).toBe("invalid_role");
    expect(rows).toHaveLength(0);
  });

  it("refuses an unknown tenant and a tenant that is not connected", async () => {
    expect(await failure(make({ tenantId: "nope" }))).toBe("tenant_unavailable");
    deps.store.findTenant = async () => ({ ...TENANT, status: "uninstalled" });
    expect(await failure(make())).toBe("tenant_unavailable");
  });

  it("refuses an email that is not a HighLevel user of that sub-account", async () => {
    deps.checkEligibility = async () => ({ eligible: false, reason: "not_a_user" });
    expect(await failure(make())).toBe("not_eligible");
    expect(rows).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("asks the eligibility check with the tenant's company and location, never browser input", async () => {
    const spy = vi.fn(async () => ({ eligible: true as const, hlUserId: "hl_1" }));
    deps.checkEligibility = spy;
    await make();
    expect(spy).toHaveBeenCalledWith(TENANT, "pat@example.test");
  });

  it("refuses an email that already has a login", async () => {
    users.push("pat@example.test");
    expect(await failure(make())).toBe("email_taken");
    expect(sent).toHaveLength(0);
  });

  it("removes the invite when the email cannot be sent, so no unreachable link stays valid", async () => {
    deps.emailSender = { send: async () => { throw new Error("smtp down token=abc"); } };
    expect(await failure(make())).toBe("send_failed");
    expect(rows).toHaveLength(0);
    expect(await createInviteService(deps).previewInvite("CODE-abc")).toEqual({ valid: false });
  });

  it("still answers send_failed when removing the invite fails too", async () => {
    deps.emailSender = { send: async () => { throw new Error("smtp down"); } };
    deps.store.deleteInvite = async () => { throw new Error("db down"); };
    expect(await failure(make())).toBe("send_failed");
  });

  it("refuses a tenant that has no company id (HighLevel cannot be asked about it)", async () => {
    deps.store.findTenant = async () => ({ ...TENANT, companyId: null });
    expect(await failure(make())).toBe("tenant_unavailable");
  });

  it("creates an office invite too", async () => {
    await make({ role: "office" });
    expect(rows[0].role).toBe("office");
  });

  it("refuses prototype-style role names", async () => {
    expect(await failure(make({ role: "constructor" as never }))).toBe("invalid_role");
  });
});

describe("previewInvite", () => {
  it("shows the email of a valid invite and nothing about the tenant's tokens", async () => {
    await make();
    expect(await createInviteService(deps).previewInvite("CODE-abc")).toEqual({ valid: true, email: "pat@example.test" });
  });

  it("is invalid for an unknown, used or expired code, with one shape", async () => {
    await make();
    const service = createInviteService(deps);
    expect(await service.previewInvite("other")).toEqual({ valid: false });
    rows[0].usedAt = NOW;
    expect(await service.previewInvite("CODE-abc")).toEqual({ valid: false });
    rows[0].usedAt = null;
    rows[0].expiresAt = new Date(NOW.getTime() - 1);
    expect(await service.previewInvite("CODE-abc")).toEqual({ valid: false });
  });
});

describe("acceptInvite", () => {
  it("creates the user with the role and tenant of the invite, not of the caller", async () => {
    await make({ role: "office" });
    await createInviteService(deps).acceptInvite({ code: "CODE-abc", name: "Pat", password: "correct horse battery" });
    expect(created).toEqual([
      { email: "pat@example.test", name: "Pat", password: "correct horse battery", role: "office", tenantId: "t1" },
    ]);
  });

  it("works once only", async () => {
    await make();
    const service = createInviteService(deps);
    await service.acceptInvite({ code: "CODE-abc", name: "Pat", password: "correct horse battery" });
    expect(await failure(service.acceptInvite({ code: "CODE-abc", name: "Pat", password: "correct horse battery" }))).toBe("invalid_invite");
    expect(created).toHaveLength(1);
  });

  it("two accepts at the same moment create one user", async () => {
    await make();
    const service = createInviteService(deps);
    const results = await Promise.all([
      failure(service.acceptInvite({ code: "CODE-abc", name: "A", password: "correct horse battery" })),
      failure(service.acceptInvite({ code: "CODE-abc", name: "B", password: "correct horse battery" })),
    ]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  it("refuses unknown and expired codes with the same code", async () => {
    await make();
    const service = createInviteService(deps);
    expect(await failure(service.acceptInvite({ code: "zzz", name: "P", password: "correct horse battery" }))).toBe("invalid_invite");
    rows[0].expiresAt = new Date(NOW.getTime() - 1);
    expect(await failure(service.acceptInvite({ code: "CODE-abc", name: "P", password: "correct horse battery" }))).toBe("invalid_invite");
  });

  it("refuses a short password and keeps the invite usable", async () => {
    await make();
    const service = createInviteService(deps);
    expect(await failure(service.acceptInvite({ code: "CODE-abc", name: "P", password: "short" }))).toBe("weak_password");
    expect(rows[0].usedAt).toBeNull();
    await service.acceptInvite({ code: "CODE-abc", name: "P", password: "correct horse battery" });
    expect(created).toHaveLength(1);
  });

  it("refuses an empty name", async () => {
    await make();
    expect(await failure(createInviteService(deps).acceptInvite({ code: "CODE-abc", name: "  ", password: "correct horse battery" }))).toBe("invalid_name");
  });

  it("releases the invite when creating the user fails", async () => {
    await make();
    deps.createUser = async () => { throw new Error("db down"); };
    expect(await failure(createInviteService(deps).acceptInvite({ code: "CODE-abc", name: "P", password: "correct horse battery" }))).toBe("failed");
    expect(rows[0].usedAt).toBeNull();
  });
});

describe("hashInviteCode", () => {
  it("is the SHA-256 hex of the code", () => {
    expect(hashInviteCode("x")).toBe(createHash("sha256").update("x").digest("hex"));
  });
});

describe("expiry boundary", () => {
  it("an invite expiring exactly now is invalid; one millisecond left is valid", async () => {
    await make();
    const service = createInviteService(deps);
    rows[0].expiresAt = new Date(NOW.getTime());
    expect(await service.previewInvite("CODE-abc")).toEqual({ valid: false });
    expect(await failure(service.acceptInvite({ code: "CODE-abc", name: "P", password: "correct horse battery" }))).toBe("invalid_invite");
    rows[0].expiresAt = new Date(NOW.getTime() + 1);
    expect(await service.previewInvite("CODE-abc")).toEqual({ valid: true, email: "pat@example.test" });
  });

  it("when the claim loses the race (used or expired between find and claim), no user is created", async () => {
    await make();
    deps.store.claimInvite = async () => false;
    expect(await failure(createInviteService(deps).acceptInvite({ code: "CODE-abc", name: "P", password: "correct horse battery" }))).toBe("invalid_invite");
    expect(created).toHaveLength(0);
  });
});

describe("accept re-checks the world", () => {
  it("refuses when the tenant was uninstalled after the invite was made", async () => {
    await make();
    deps.store.findTenant = async () => ({ ...TENANT, status: "uninstalled" });
    expect(await failure(createInviteService(deps).acceptInvite({ code: "CODE-abc", name: "P", password: "correct horse battery" }))).toBe("invalid_invite");
    expect(created).toHaveLength(0);
    expect(rows[0].usedAt).toBeNull();
  });

  it("refuses with email_taken when the email got a login in the meantime, without burning the invite", async () => {
    await make();
    users.push("pat@example.test");
    expect(await failure(createInviteService(deps).acceptInvite({ code: "CODE-abc", name: "P", password: "correct horse battery" }))).toBe("email_taken");
    expect(created).toHaveLength(0);
    expect(rows[0].usedAt).toBeNull();
  });
});

describe("accept input limits and recovery", () => {
  const accept = (over: Partial<{ name: string; password: string }> = {}) =>
    createInviteService(deps).acceptInvite({ code: "CODE-abc", name: "Pat", password: "correct horse battery", ...over });

  it("refuses a name over 120 characters and a password over 128", async () => {
    await make();
    expect(await failure(accept({ name: "x".repeat(121) }))).toBe("invalid_name");
    expect(await failure(accept({ password: "p".repeat(129) }))).toBe("weak_password");
    expect(rows[0].usedAt).toBeNull();
  });

  it("answers failed even when creating the user and releasing the invite both throw", async () => {
    await make();
    deps.createUser = async () => { throw new Error("db down"); };
    deps.store.releaseInvite = async () => { throw new Error("db down"); };
    expect(await failure(accept())).toBe("failed");
  });

  it("works again on a retry after a failed creation (the invite was released)", async () => {
    await make();
    const original = deps.createUser;
    deps.createUser = async () => { throw new Error("db down"); };
    expect(await failure(accept())).toBe("failed");
    deps.createUser = original;
    await accept();
    expect(created).toHaveLength(1);
  });

  it("an owner invite creates an owner of the invite's tenant", async () => {
    await make({ role: "owner" });
    await accept();
    expect(created[0]).toMatchObject({ role: "owner", tenantId: "t1" });
  });
});
