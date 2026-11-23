import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInviteService, hashInviteCode, InviteError, type InviteRecord, type InviteServiceDeps } from "@/features/auth";

// Bug sweep 2026-11-23, A3: accept re-checks HighLevel and stores the link.
const NOW = new Date("2026-11-23T12:00:00Z");
const TENANT = { id: "t1", name: "T", locationId: "loc_1", companyId: "co_1", status: "connected" as const };
const input = { code: "CODE", name: "Pat", password: "correct horse battery" };
let invite: InviteRecord;
let links: Array<{ tenantId: string; ghlUserId: string; userId: string }>;
let createUser: ReturnType<typeof vi.fn>;
let deps: InviteServiceDeps;

beforeEach(() => {
  invite = { id: "i1", tenantId: "t1", email: "pat@example.test", role: "owner", hlUserId: "hl_1", expiresAt: new Date(NOW.getTime() + 1000), usedAt: null };
  links = [];
  createUser = vi.fn(async () => ({ userId: "u_new" }));
  deps = {
    now: () => NOW,
    newCode: () => "CODE",
    appUrl: "https://crm.example.test",
    emailSender: { send: async () => ({ delivered: false }) },
    checkEligibility: vi.fn(async () => ({ eligible: true as const, hlUserId: "hl_1" })),
    createUser: createUser as unknown as InviteServiceDeps["createUser"],
    links: {
      find: async (tenantId, ghlUserId) => links.find((l) => l.tenantId === tenantId && l.ghlUserId === ghlUserId) ?? null,
      insert: async (tenantId, ghlUserId, userId) => {
        if (!links.some((l) => l.tenantId === tenantId && l.ghlUserId === ghlUserId)) links.push({ tenantId, ghlUserId, userId });
      },
    },
    store: {
      findTenant: async () => TENANT,
      emailTaken: async () => false,
      insertInvite: async () => ({ id: "i1" }),
      findInviteByCodeHash: async (hash) => (hash === hashInviteCode("CODE") ? invite : null),
      claimInvite: async (_id, at) => { if (invite.usedAt) return false; invite.usedAt = at; return true; },
      releaseInvite: async () => { invite.usedAt = null; },
      deleteInvite: async () => {},
    },
  };
});

const code = (promise: Promise<unknown>) => promise.then(() => "ok", (e) => (e instanceof InviteError ? e.code : "other"));
const accept = () => createInviteService(deps).acceptInvite(input);

describe("acceptInvite re-checks HighLevel", () => {
  it("stores the link for the new user", async () => {
    await accept();
    expect(deps.checkEligibility).toHaveBeenCalledWith(TENANT, "pat@example.test");
    expect(links).toEqual([{ tenantId: "t1", ghlUserId: "hl_1", userId: "u_new" }]);
  });

  it("links the id HighLevel names now when the person was re-created", async () => {
    deps.checkEligibility = async () => ({ eligible: true, hlUserId: "hl_2" });
    await accept();
    expect(links[0].ghlUserId).toBe("hl_2");
  });

  it.each(["deleted", "not_a_user", "not_in_location"] as const)("refuses %s and leaves the invite unused", async (reason) => {
    deps.checkEligibility = async () => ({ eligible: false, reason });
    expect(await code(accept())).toBe("not_eligible");
    expect(createUser).not.toHaveBeenCalled();
    expect(invite.usedAt).toBeNull();
  });

  it("a failed lookup or a throw leaves the invite unused", async () => {
    deps.checkEligibility = async () => ({ eligible: false, reason: "lookup_failed" });
    expect(await code(accept())).toBe("failed");
    deps.checkEligibility = async () => { throw new Error("hl down"); };
    expect(await code(accept())).toBe("failed");
    expect(createUser).not.toHaveBeenCalled();
    expect(invite.usedAt).toBeNull();
  });

  it("refuses when the HighLevel id already belongs to another user, and changes nothing", async () => {
    links.push({ tenantId: "t1", ghlUserId: "hl_1", userId: "u_existing" });
    expect(await code(accept())).toBe("not_eligible");
    expect(links).toEqual([{ tenantId: "t1", ghlUserId: "hl_1", userId: "u_existing" }]);
    expect(createUser).not.toHaveBeenCalled();
    expect(invite.usedAt).toBeNull();
  });

  it("keeps the account when storing the link fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    (deps.links as NonNullable<InviteServiceDeps["links"]>).insert = async () => { throw new Error("db down"); };
    expect(await accept()).toEqual({ userId: "u_new" });
    expect(invite.usedAt).toEqual(NOW);
    error.mockRestore();
  });
});
