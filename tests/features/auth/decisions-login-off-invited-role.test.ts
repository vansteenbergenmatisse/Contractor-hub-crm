import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import {
  createAuth,
  createGuards,
  createInvitedUser,
  createInviteService,
  handleSetTenantLogin,
  hashInviteCode,
  provisionGhlUser,
  type InviteRecord,
  type InviteServiceDeps,
  type ProvisionDeps,
  type SessionUser,
} from "@/features/auth";
import { resolveEmbedAccess, resolveEmbedUser, type EmbedCandidate, type UserContext } from "@/features/embed";
import { loginState, toClientRow } from "@/features/admin";
import { syncTenantUsers } from "@/features/onboarding";

type User = {
  id: string;
  name: string;
  role: "owner" | "office" | "admin";
  tenantId: string | null;
  disabledAt: Date | null;
  email: string;
};
type Link = { tenantId: string; ghlUserId: string; userId: string; deletedAt: Date | null };

const NOW = new Date("2026-11-23T10:00:00.000Z");
const base = { tenantId: "t1", ghlUserId: "g1", email: "pat@example.test", name: "Pat", ghlRole: "user", ghlRoleType: "account" };
let users: User[];
let links: Link[];
let loginOff: boolean;
let invitedRoles: Record<string, "owner" | "office">;
let deps: ProvisionDeps;

beforeEach(() => {
  users = [];
  links = [];
  loginOff = false;
  invitedRoles = {};
  deps = {
    createUser: vi.fn(async (input) => {
      const user: User = { id: `u${users.length + 1}`, name: input.name, role: input.role, tenantId: input.tenantId, disabledAt: null, email: input.email };
      users.push(user);
      return { userId: user.id };
    }),
    updateUser: vi.fn(async (id, patch) => { Object.assign(users.find((u) => u.id === id) as User, patch); }),
    setDisabled: vi.fn(async (id, disabled) => { (users.find((u) => u.id === id) as User).disabledAt = disabled ? NOW : null; }),
    sendSetPassword: vi.fn(async () => {}),
    randomPassword: () => "x".repeat(40),
    store: {
      findLink: async (t, g) => links.find((l) => l.tenantId === t && l.ghlUserId === g) ?? null,
      findLinkByUserId: async (u) => links.find((l) => l.userId === u) ?? null,
      relinkUser: vi.fn(async () => {}),
      insertLink: vi.fn(async (t, g, u) => { links.push({ tenantId: t, ghlUserId: g, userId: u, deletedAt: null }); }),
      setLinkDeleted: vi.fn(async (t, g, d) => { for (const l of links) if (l.tenantId === t && l.ghlUserId === g) l.deletedAt = d; }),
      findUserByEmail: async (e) => users.find((u) => u.email === e) ?? null,
      findUserById: async (id) => users.find((u) => u.id === id) ?? null,
      isTenantLoginOff: async () => loginOff,
      findInvitedRole: async (t, e) => invitedRoles[`${t}:${e}`] ?? null,
    },
    now: () => NOW,
  };
});

const linked = (user: Partial<User>, link: Partial<Link> = {}) => {
  users.push({ id: "u1", name: "Pat", role: "office", tenantId: "t1", disabledAt: null, email: "pat@example.test", ...user });
  links.push({ tenantId: "t1", ghlUserId: "g1", userId: "u1", deletedAt: null, ...link });
};

describe("A4: the invite's role wins over HighLevel", () => {
  it("keeps an invited owner when HighLevel says user", async () => {
    linked({ role: "owner" });
    invitedRoles["t1:pat@example.test"] = "owner";
    await provisionGhlUser(deps, { ...base, ghlRole: "user" });
    expect(users[0].role).toBe("owner");
  });

  it("keeps an invited office user when HighLevel says admin", async () => {
    linked({ role: "office" });
    invitedRoles["t1:pat@example.test"] = "office";
    await provisionGhlUser(deps, { ...base, ghlRole: "admin" });
    expect(users[0].role).toBe("office");
  });

  it.each([["owner"], ["office"]] as const)("a null HighLevel role changes nothing for %s", async (role) => {
    linked({ role });
    await provisionGhlUser(deps, { ...base, ghlRole: null });
    expect(users[0].role).toBe(role);
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it("a null HighLevel role never demotes, even when the stored invite says office", async () => {
    linked({ role: "owner" });
    invitedRoles["t1:pat@example.test"] = "office";
    await provisionGhlUser(deps, { ...base, ghlRole: null });
    expect(users[0].role).toBe("owner");
  });

  it("a user with no invite keeps following HighLevel", async () => {
    linked({ role: "office" });
    await provisionGhlUser(deps, { ...base, ghlRole: "admin" });
    expect(users[0].role).toBe("owner");
  });

  it("looks the invite up by the account's own email, not the one HighLevel sends now", async () => {
    linked({ role: "owner" });
    invitedRoles["t1:pat@example.test"] = "owner";
    await provisionGhlUser(deps, { ...base, email: "changed@example.test", ghlRole: "user" });
    expect(users[0].role).toBe("owner");
  });

  it("a failed invite lookup changes nobody's role", async () => {
    linked({ role: "owner" });
    deps.store.findInvitedRole = async () => { throw new Error("db down"); };
    await expect(provisionGhlUser(deps, { ...base, ghlRole: "user" })).rejects.toThrow();
    expect(users[0].role).toBe("owner");
  });
});

function testAuth(isTenantBlocked?: (tenantId: string) => Promise<boolean>) {
  return createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: "https://app.example.test",
    emailSender: { send: async () => ({ delivered: false }) },
    isTenantBlocked,
  });
}

const signIn = (auth: ReturnType<typeof testAuth>) =>
  auth.handler(new Request("https://app.example.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.test" },
    body: JSON.stringify({ email: "pat@example.test", password: "correct horse battery staple" }),
  }));

function inviteDeps(invite: InviteRecord, overrides: Partial<InviteServiceDeps> & { loginDisabledAt?: Date | null } = {}): InviteServiceDeps {
  const { loginDisabledAt = null, ...rest } = overrides;
  return {
    now: () => NOW,
    newCode: () => "CODE",
    appUrl: "https://crm.example.test",
    emailSender: { send: vi.fn(async () => ({ delivered: false })) },
    checkEligibility: async () => ({ eligible: true, hlUserId: "g1" }),
    createUser: vi.fn(async () => ({ userId: "u9" })),
    store: {
      findTenant: async () => ({ id: "t1", name: "T", locationId: "loc_1", companyId: "co_1", status: "connected", loginDisabledAt }),
      emailTaken: async () => false,
      insertInvite: vi.fn(async () => ({ id: "i2" })),
      findInviteByCodeHash: async (hash) => (hash === hashInviteCode("CODE") ? invite : null),
      claimInvite: vi.fn(async () => true),
      releaseInvite: async () => {},
      deleteInvite: async () => {},
    },
    ...rest,
  };
}

describe("A2: login off for a client admits nobody", () => {
  it("provisioning creates no user and sends no mail", async () => {
    loginOff = true;
    const result = await provisionGhlUser(deps, base);
    expect(result).toEqual({ outcome: "skipped_login_off", userId: null });
    expect(deps.createUser).not.toHaveBeenCalled();
    expect(deps.sendSetPassword).not.toHaveBeenCalled();
  });

  it("a user the sync blocked is not restored", async () => {
    linked({ disabledAt: NOW }, { deletedAt: NOW });
    loginOff = true;
    await provisionGhlUser(deps, base);
    expect(deps.setDisabled).not.toHaveBeenCalled();
    expect(users[0].disabledAt).toEqual(NOW);
    expect(links[0].deletedAt).toEqual(NOW);
  });

  it("an account is not linked or moved into the client", async () => {
    users.push({ id: "u1", name: "Pat", role: "office", tenantId: "other", disabledAt: null, email: "pat@example.test" });
    loginOff = true;
    await provisionGhlUser(deps, base);
    expect(deps.store.insertLink).not.toHaveBeenCalled();
    expect(users[0].tenantId).toBe("other");
  });

  it("a failed login-off lookup creates nobody", async () => {
    deps.store.isTenantLoginOff = async () => { throw new Error("db down"); };
    await expect(provisionGhlUser(deps, base)).rejects.toThrow();
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("the sync does not count a login-off skip as an email conflict", async () => {
    loginOff = true;
    const counts = await syncTenantUsers(
      { provision: (input) => provisionGhlUser(deps, input), deactivate: async () => false, activeLinks: async () => [] },
      "t1",
      [{ id: "g1", email: "pat@example.test", name: "Pat", role: "user", roleType: "account", deleted: false }] as never,
    );
    expect(counts.created).toBe(0);
    expect(counts.skippedConflict).toBe(0);
    expect(counts.failed).toBe(0);
  });

  const context: UserContext = { email: "pat@example.test", activeLocation: "loc_1", companyId: "co_1" };
  const off = new Date(NOW);

  it("embed denies an existing user", async () => {
    const candidate: EmbedCandidate = { userId: "u1", role: "owner", disabledAt: null, tenant: { status: "connected", companyId: "co_1", loginDisabledAt: off } };
    expect(await resolveEmbedAccess(context, { findCandidate: async () => candidate, findTenant: async () => null })).toEqual({ kind: "denied", reason: "tenant_login_off" });
    expect(await resolveEmbedUser(context, { findCandidate: async () => candidate })).toBeNull();
  });

  it("embed does not ask to provision a new person", async () => {
    const access = await resolveEmbedAccess(context, {
      findCandidate: async () => null,
      findTenant: async () => ({ tenantId: "t1", status: "connected", companyId: "co_1", loginDisabledAt: off }),
    });
    expect(access).toEqual({ kind: "denied", reason: "tenant_login_off" });
  });

  it("embed still signs people in while login is on", async () => {
    const candidate: EmbedCandidate = { userId: "u1", role: "owner", disabledAt: null, tenant: { status: "connected", companyId: "co_1", loginDisabledAt: null } };
    expect(await resolveEmbedAccess(context, { findCandidate: async () => candidate, findTenant: async () => null })).toEqual({ kind: "user", userId: "u1" });
  });

  const invite: InviteRecord = { id: "i1", tenantId: "t1", email: "pat@example.test", role: "office", hlUserId: "g1", expiresAt: new Date(NOW.getTime() + 1000), usedAt: null };

  it("an invite cannot be accepted, and stays unspent", async () => {
    const built = inviteDeps(invite, { loginDisabledAt: off });
    const service = createInviteService(built);
    await expect(service.acceptInvite({ code: "CODE", name: "Pat", password: "correct horse battery staple" })).rejects.toMatchObject({ code: "invalid_invite" });
    expect(built.createUser).not.toHaveBeenCalled();
    expect(built.store.claimInvite).not.toHaveBeenCalled();
  });

  it("an invite preview reads as invalid", async () => {
    expect(await createInviteService(inviteDeps(invite, { loginDisabledAt: off })).previewInvite("CODE")).toEqual({ valid: false });
    expect(await createInviteService(inviteDeps(invite)).previewInvite("CODE")).toEqual({ valid: true, email: invite.email });
  });

  it("no new invite can be created", async () => {
    const built = inviteDeps(invite, { loginDisabledAt: off });
    await expect(createInviteService(built).createInvite({ tenantId: "t1", email: "new@example.test", role: "office", createdById: "a1" })).rejects.toMatchObject({ code: "tenant_unavailable" });
    expect(built.store.insertInvite).not.toHaveBeenCalled();
  });

  it("a password sign-in gets no session", async () => {
    const auth = testAuth(async () => true);
    await createInvitedUser(auth, { email: "pat@example.test", name: "Pat", password: "correct horse battery staple", role: "owner", tenantId: "t1" });
    expect((await signIn(auth)).ok).toBe(false);
  });

  it("the admin page shows off from the tenant field, even with no users", () => {
    expect(loginState(0, 0, true)).toBe("off");
    expect(loginState(2, 2, true)).toBe("off");
    expect(loginState(2, 1, false)).toBe("on");
    expect(toClientRow({ id: "t1", name: "T", locationId: "l", status: "connected", loginDisabledAt: off }, 0, 0).login).toBe("off");
  });
});

describe("A2: the admin switch", () => {
  const ORIGIN = "https://crm.example.test";
  const admin: SessionUser = { id: "a1", email: "a@x.test", name: "A", role: "admin", tenantId: null };
  const post = (disabled: boolean) => new Request(`${ORIGIN}/api/admin/clients/T1/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ disabled }),
  });

  function setup(order: string[] = []) {
    return {
      guards: createGuards({ getSession: async () => admin }),
      listUserIds: vi.fn(async () => ["u1"]),
      setUserDisabled: vi.fn(async (_id: string, disabled: boolean) => { order.push(`user:${disabled}`); }),
      setTenantLoginDisabled: vi.fn(async (_id: string, disabled: boolean) => { order.push(`tenant:${disabled}`); }),
      limiter: vi.fn(async () => true),
      appOrigin: ORIGIN,
      afterTurnOn: vi.fn(async () => { order.push("check"); return true; }),
    };
  }

  it("turning off sets the tenant field before any user is touched", async () => {
    const order: string[] = [];
    const response = await handleSetTenantLogin(post(true), "T1", setup(order));
    expect(response.status).toBe(200);
    expect(order).toEqual(["tenant:true", "user:true"]);
  });

  it("if the tenant field cannot be set, no user is changed and the answer is an error", async () => {
    const built = setup();
    built.setTenantLoginDisabled.mockRejectedValueOnce(new Error("db"));
    const response = await handleSetTenantLogin(post(true), "T1", built);
    expect(response.status).toBe(500);
    expect(built.setUserDisabled).not.toHaveBeenCalled();
  });

  it("turning on clears the field only after the users and the re-check", async () => {
    const order: string[] = [];
    await handleSetTenantLogin(post(false), "T1", setup(order));
    expect(order).toEqual(["user:false", "check", "tenant:false"]);
  });

  it("a failed re-check does not undo a turn-on", async () => {
    const built = setup();
    built.afterTurnOn.mockResolvedValueOnce(false);
    const response = await handleSetTenantLogin(post(false), "T1", built);
    expect(await response.json()).toEqual({ affected: 1, removedCheck: "failed" });
    expect(built.setTenantLoginDisabled).toHaveBeenCalledWith("T1", false);
  });

  it("a partial turn-on keeps the client off so a retry can finish it", async () => {
    const built = setup();
    built.setUserDisabled.mockRejectedValueOnce(new Error("db"));
    const response = await handleSetTenantLogin(post(false), "T1", built);
    expect(response.status).toBe(500);
    expect(built.setTenantLoginDisabled).not.toHaveBeenCalled();
  });

  it("a failed clear answers an error instead of reporting login on", async () => {
    const built = setup();
    built.setTenantLoginDisabled.mockRejectedValueOnce(new Error("db"));
    const response = await handleSetTenantLogin(post(false), "T1", built);
    expect(response.status).toBe(500);
  });
});
