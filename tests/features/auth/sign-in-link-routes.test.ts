import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGuards,
  createInviteService,
  handleCreateInvite,
  handleListSignInAccounts,
  handleSendSignInEmail,
  InviteError,
  type InviteServiceDeps,
  type SessionUser,
} from "@/features/auth";

// The admin's "Send sign-in email" endpoints and "Invite owner" on an email the sync already gave an account.
const ORIGIN = "https://crm.example.test";
const admin: SessionUser = { id: "a1", email: "a@x.test", name: "A", role: "admin", tenantId: null };
const owner: SessionUser = { id: "u1", email: "o@x.test", name: "O", role: "owner", tenantId: "t1" };
const guards = (user: SessionUser | null) => createGuards({ getSession: async () => user });
const allow = async () => true;
const EXPIRES = new Date("2026-11-25T10:00:00Z");

const issued = () => ({ userId: "u9", email: "p@x.test", link: `${ORIGIN}/reset-password?token=TOK`, expiresAt: EXPIRES, mail: "held" as const });
const service = () => ({
  sendForUser: vi.fn(async () => issued()),
  listAccounts: vi.fn(async () => [{ userId: "u9", name: "P", email: "p@x.test", role: "owner" as const, state: "never_signed_in" as const }]),
});
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/invites/sign-in-email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

afterEach(() => vi.restoreAllMocks());

describe("POST send sign-in email", () => {
  const run = (user: SessionUser | null, request: Request, svc = service(), limiter: (key: string) => Promise<boolean> = allow) =>
    handleSendSignInEmail(request, { guards: guards(user), service: svc, appOrigin: ORIGIN, limiter }).then((r) => ({ r, svc }));

  it("returns the link and the honest mail outcome, uncached, and audits without email or link", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { r, svc } = await run(admin, post({ tenantId: "t1", userId: "u9" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ kind: "set_password", link: `${ORIGIN}/reset-password?token=TOK`, email: "p@x.test", mail: "held", expiresAt: EXPIRES.toISOString() });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(svc.sendForUser).toHaveBeenCalledWith({ tenantId: "t1", userId: "u9" });
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("sign_in_link_issued");
    expect(logged).not.toContain("p@x.test");
    expect(logged).not.toContain("TOK");
  });

  it.each([["an owner", owner], ["nobody", null]])("is closed to %s", async (_label, user) => {
    const { r, svc } = await run(user, post({ tenantId: "t1", userId: "u9" }));
    expect(r.status).toBe(403);
    expect(svc.sendForUser).not.toHaveBeenCalled();
  });

  it("refuses another origin and a missing origin", async () => {
    expect((await run(admin, post({ tenantId: "t1", userId: "u9" }, { origin: "https://evil.test" }))).r.status).toBe(403);
    const bare = new Request(`${ORIGIN}/api/invites/sign-in-email`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await run(admin, bare)).r.status).toBe(403);
  });

  it("is rate limited per admin", async () => {
    const limiter = vi.fn(async () => false);
    const { r, svc } = await run(admin, post({ tenantId: "t1", userId: "u9" }), service(), limiter);
    expect(r.status).toBe(429);
    expect(limiter).toHaveBeenCalledWith("sign-in-email:a1");
    expect(svc.sendForUser).not.toHaveBeenCalled();
  });

  it.each([{}, { tenantId: "t1" }, { tenantId: "t1", userId: "../x" }, { tenantId: "t".repeat(65), userId: "u9" }])("answers 400 for %j", async (body) => {
    const { r, svc } = await run(admin, post(body));
    expect(r.status).toBe(400);
    expect(svc.sendForUser).not.toHaveBeenCalled();
  });

  it("maps refusals to fixed codes", async () => {
    const table: [string, number][] = [["already_active", 409], ["account_disabled", 409], ["not_found", 404], ["tenant_unavailable", 404], ["not_eligible", 422], ["failed", 500]];
    for (const [code, status] of table) {
      const svc = service();
      svc.sendForUser.mockRejectedValue(new InviteError(code as never));
      vi.spyOn(console, "info").mockImplementation(() => {});
      const { r } = await run(admin, post({ tenantId: "t1", userId: "u9" }), svc);
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ error: code });
    }
  });
});

describe("GET users of a client", () => {
  const get = (query: string) => new Request(`${ORIGIN}/api/invites/sign-in-email${query}`);

  it("lists the users for an admin", async () => {
    const svc = service();
    const r = await handleListSignInAccounts(get("?tenantId=t1"), { guards: guards(admin), service: svc, limiter: allow });
    expect(r.status).toBe(200);
    expect((await r.json()).users).toHaveLength(1);
    expect(svc.listAccounts).toHaveBeenCalledWith("t1");
  });

  it("is closed to everyone else and checks the tenant id", async () => {
    const svc = service();
    expect((await handleListSignInAccounts(get("?tenantId=t1"), { guards: guards(owner), service: svc, limiter: allow })).status).toBe(403);
    expect((await handleListSignInAccounts(get(""), { guards: guards(admin), service: svc, limiter: allow })).status).toBe(400);
    expect(svc.listAccounts).not.toHaveBeenCalled();
  });
});

describe("Invite owner on an email that already has an account", () => {
  const TENANT = { id: "t1", name: "Green Acres", locationId: "loc_1", companyId: "co_1", status: "connected" as const };
  const deps = (over: Partial<InviteServiceDeps> = {}): InviteServiceDeps => ({
    now: () => new Date("2026-11-24T10:00:00Z"),
    newCode: () => "CODE",
    appUrl: ORIGIN,
    emailSender: { send: async () => ({ delivered: false }) },
    checkEligibility: async () => ({ eligible: true, hlUserId: "hl_1" }),
    createUser: async () => ({ userId: "new" }),
    store: {
      findTenant: async () => TENANT,
      emailTaken: async () => true,
      insertInvite: vi.fn(async () => ({ id: "inv" })),
      findInviteByCodeHash: async () => null,
      claimInvite: async () => false,
      releaseInvite: async () => {},
      deleteInvite: async () => {},
    },
    ...over,
  });

  it("issues a set-password link instead of failing, and makes no invite", async () => {
    const existingAccount = vi.fn(async () => issued());
    const d = deps({ existingAccount });
    const result = await createInviteService(d).createInvite({ tenantId: "t1", email: "P@x.test", role: "owner", createdById: "a1" });
    expect(result).toMatchObject({ kind: "set_password", link: `${ORIGIN}/reset-password?token=TOK`, mail: "held" });
    expect(existingAccount).toHaveBeenCalledWith(TENANT, "p@x.test");
    expect(d.store.insertInvite).not.toHaveBeenCalled();
  });

  it("keeps the live HighLevel check first", async () => {
    const existingAccount = vi.fn(async () => issued());
    const d = deps({ existingAccount, checkEligibility: async () => ({ eligible: false, reason: "not_a_user" }) });
    const outcome = await createInviteService(d).createInvite({ tenantId: "t1", email: "p@x.test", role: "owner", createdById: "a1" }).catch((e: InviteError) => e.code);
    expect(outcome).toBe("not_eligible");
    expect(existingAccount).not.toHaveBeenCalled();
  });

  it("passes the refusal for a used account through", async () => {
    const d = deps({ existingAccount: async () => { throw new InviteError("already_active"); } });
    const outcome = await createInviteService(d).createInvite({ tenantId: "t1", email: "p@x.test", role: "owner", createdById: "a1" }).catch((e: InviteError) => e.code);
    expect(outcome).toBe("already_active");
  });

  it("answers the route with kind set_password and the mail outcome", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const svc = { createInvite: vi.fn(async () => ({ kind: "set_password" as const, ...issued() })) };
    const r = await handleCreateInvite(
      new Request(`${ORIGIN}/api/admin/invites`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ tenantId: "t1", email: "p@x.test", role: "owner" }) }),
      { guards: guards(admin), service: svc, appOrigin: ORIGIN, limiter: allow },
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ kind: "set_password", link: `${ORIGIN}/reset-password?token=TOK`, email: "p@x.test", mail: "held", expiresAt: EXPIRES.toISOString() });
  });

  it("maps already_active to 409 on the invite route", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const svc = { createInvite: vi.fn(async () => { throw new InviteError("already_active"); }) };
    const r = await handleCreateInvite(
      new Request(`${ORIGIN}/api/admin/invites`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ tenantId: "t1", email: "p@x.test", role: "owner" }) }),
      { guards: guards(admin), service: svc, appOrigin: ORIGIN, limiter: allow },
    );
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "already_active" });
  });
});

describe("a new invite reports its mail honestly", () => {
  it("says held when the guard keeps the mail back, and names the business", async () => {
    const sent: { subject: string; text: string }[] = [];
    const result = await createInviteService({
      now: () => new Date("2026-11-24T10:00:00Z"),
      newCode: () => "CODE",
      appUrl: ORIGIN,
      emailSender: { send: async (m) => (sent.push(m), { delivered: false }) },
      checkEligibility: async () => ({ eligible: true, hlUserId: "hl_1" }),
      createUser: async () => ({ userId: "new" }),
      store: {
        findTenant: async () => ({ id: "t1", name: "Green Acres", locationId: "l", companyId: "c", status: "connected" }),
        emailTaken: async () => false,
        insertInvite: async () => ({ id: "inv" }),
        findInviteByCodeHash: async () => null,
        claimInvite: async () => false,
        releaseInvite: async () => {},
        deleteInvite: async () => {},
      },
    }).createInvite({ tenantId: "t1", email: "p@x.test", role: "owner", createdById: "a1" });
    expect(result).toMatchObject({ kind: "invite", mail: "held" });
    expect(sent[0].subject).toContain("Green Acres");
    expect(sent[0].text).toContain("Green Acres");
  });
});
