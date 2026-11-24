import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountState, createSignInLinkService, InviteError, type EmailMessage, type SignInLinkDeps } from "@/features/auth";

// A fresh set-password link for an account the sync made: only for a never-used account in THIS
// tenant, mailed through the guard, always returned for the admin to copy.
const NOW = new Date("2026-11-24T10:00:00Z");
const TENANT = { id: "t1", name: "Green Acres", locationId: "loc_1", companyId: "co_1", status: "connected" as const, loginDisabledAt: null };
const FP = "fp-first-password";

type Snapshot = Awaited<ReturnType<SignInLinkDeps["store"]["readSnapshot"]>>;
const unused = (over: Partial<NonNullable<Snapshot>> = {}): NonNullable<Snapshot> => ({
  role: "owner",
  tenantId: "t1",
  disabledAt: null,
  linkDeletedAt: null,
  marker: { tenantId: "t1", credentialFingerprint: FP },
  credentials: [{ providerId: "credential", passwordFingerprint: FP }],
  sessionCount: 0,
  ...over,
});

const users = {
  u1: { id: "u1", email: "owner@acme.test", name: "Olive", role: "owner" as const, tenantId: "t1" },
  u2: { id: "u2", email: "other@acme.test", name: "Otto", role: "owner" as const, tenantId: "t2" },
  a1: { id: "a1", email: "staff@ff.test", name: "Staff", role: "admin" as const, tenantId: null },
};

let sent: EmailMessage[];
let tokens: Array<{ userId: string; token: string; expiresAt: Date }>;
let snapshot: Snapshot;
let deps: SignInLinkDeps;

beforeEach(() => {
  sent = [];
  tokens = [];
  snapshot = unused();
  deps = {
    now: () => NOW,
    appUrl: "https://crm.example.test/",
    emailSender: { send: async (m) => (sent.push(m), { delivered: true }) },
    checkEligibility: async () => ({ eligible: true, hlUserId: "hl_1" }),
    newToken: () => "TOKEN_abc",
    store: {
      findTenant: async (id) => (id === "t1" ? TENANT : null),
      findUserByEmail: async (email) => Object.values(users).find((u) => u.email === email) ?? null,
      findUserById: async (id) => (users as Record<string, (typeof users)["u1"] | (typeof users)["a1"]>)[id] ?? null,
      readSnapshot: async () => snapshot,
      listTenantAccounts: async () => [],
      replaceResetToken: async (userId, token, expiresAt) => {
        tokens.push({ userId, token, expiresAt });
      },
    },
  };
});

const codeOf = async (promise: Promise<unknown>) =>
  promise.then(() => "ok", (error: unknown) => (error instanceof InviteError ? error.code : "other"));
const send = (over: Partial<{ tenantId: string; userId: string }> = {}) =>
  createSignInLinkService(deps).sendForUser({ tenantId: "t1", userId: "u1", ...over });

describe("accountState", () => {
  it("is never_signed_in only with a matching marker, one credential and no session", () => {
    expect(accountState(unused(), "t1")).toBe("never_signed_in");
    expect(accountState(unused({ sessionCount: 1 }), "t1")).toBe("signed_in");
    expect(accountState(unused({ credentials: [{ providerId: "credential", passwordFingerprint: "changed" }] }), "t1")).toBe("signed_in");
    expect(accountState(unused({ marker: null }), "t1")).toBe("unproven");
    expect(accountState(unused({ marker: { tenantId: "t9", credentialFingerprint: FP } }), "t1")).toBe("unproven");
    expect(accountState(unused({ disabledAt: NOW }), "t1")).toBe("login_off");
    expect(accountState(unused({ linkDeletedAt: NOW }), "t1")).toBe("login_off");
    expect(accountState(null, "t1")).toBe("unproven");
  });
});

describe("sendForUser", () => {
  it("stores a fresh 24-hour token for the user and returns the reset link", async () => {
    const result = await send();
    expect(tokens).toEqual([{ userId: "u1", token: "TOKEN_abc", expiresAt: new Date(NOW.getTime() + 24 * 3600_000) }]);
    expect(result).toMatchObject({ userId: "u1", email: "owner@acme.test", link: "https://crm.example.test/reset-password?token=TOKEN_abc", mail: "sent" });
    expect(result.expiresAt).toEqual(new Date("2026-11-25T10:00:00Z"));
  });

  it("mails a plain text naming the business, the link, the expiry and where to sign in", async () => {
    await send();
    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail.to).toBe("owner@acme.test");
    expect(mail.kind).toBe("password_reset");
    expect(mail.subject).toBe("Choose your password for Green Acres");
    expect(mail.text).toContain("You have an account in the CRM for Green Acres.");
    expect(mail.text).toContain("https://crm.example.test/reset-password?token=TOKEN_abc");
    expect(mail.text).toContain("expires in 24 hours (2026-11-25 10:00 UTC)");
    expect(mail.text).toContain("https://crm.example.test/sign-in");
  });

  it("reports a mail the guard held back, and still returns the link", async () => {
    deps.emailSender = { send: async () => ({ delivered: false }) };
    const result = await send();
    expect(result.mail).toBe("held");
    expect(result.link).toContain("TOKEN_abc");
  });

  it("reports a provider failure without losing the link", async () => {
    deps.emailSender = { send: async () => { throw new Error("status 500"); } };
    const result = await send();
    expect(result.mail).toBe("failed");
    expect(tokens).toHaveLength(1);
  });

  it("goes through the client's daily mail budget and says capped when it is used up", async () => {
    const budget = vi.fn(async () => {}); // over the cap: never runs the send
    deps.mailBudget = budget;
    const result = await send();
    expect(budget).toHaveBeenCalledWith("t1", expect.any(Function));
    expect(result.mail).toBe("capped");
    expect(sent).toHaveLength(0);
    expect(result.link).toContain("TOKEN_abc");
  });

  it("sends when the budget allows it", async () => {
    deps.mailBudget = async (...args) => args[1]();
    expect((await send()).mail).toBe("sent");
  });

  it.each([
    ["has signed in", unused({ sessionCount: 2 }), "already_active"],
    ["changed the password", unused({ credentials: [{ providerId: "credential", passwordFingerprint: "new" }] }), "already_active"],
    ["cannot be proven unused", unused({ marker: null }), "already_active"],
    ["is turned off", unused({ disabledAt: NOW }), "account_disabled"],
  ])("refuses an account that %s, with no link and no mail", async (_label, state, code) => {
    snapshot = state;
    expect(await codeOf(send())).toBe(code);
    expect(tokens).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("answers not_found for another tenant's user and for an admin", async () => {
    expect(await codeOf(send({ userId: "u2" }))).toBe("not_found");
    expect(await codeOf(send({ userId: "a1" }))).toBe("not_found");
    expect(await codeOf(send({ userId: "ghost" }))).toBe("not_found");
    expect(tokens).toHaveLength(0);
  });

  it("refuses a client that is not connected or has login off", async () => {
    deps.store.findTenant = async () => ({ ...TENANT, status: "uninstalled" });
    expect(await codeOf(send())).toBe("tenant_unavailable");
    deps.store.findTenant = async () => ({ ...TENANT, loginDisabledAt: NOW });
    expect(await codeOf(send())).toBe("tenant_unavailable");
    expect(await codeOf(send({ tenantId: "nope" }))).toBe("tenant_unavailable");
  });

  it("keeps the live HighLevel check: a person no longer in the sub-account gets nothing", async () => {
    const check = vi.fn(async () => ({ eligible: false as const, reason: "not_in_location" as const }));
    deps.checkEligibility = check;
    expect(await codeOf(send())).toBe("not_eligible");
    expect(check).toHaveBeenCalledWith(TENANT, "owner@acme.test");
    deps.checkEligibility = async () => ({ eligible: false, reason: "lookup_failed" });
    expect(await codeOf(send())).toBe("failed");
    deps.checkEligibility = async () => { throw new Error("token=secret"); };
    expect(await codeOf(send())).toBe("failed");
    expect(tokens).toHaveLength(0);
  });
});

describe("issueForEmail (Invite owner on an email that has an account)", () => {
  it("issues a link for a never-used account of the same tenant", async () => {
    const result = await createSignInLinkService(deps).issueForEmail(TENANT, "Owner@Acme.test");
    expect(result).toMatchObject({ userId: "u1", mail: "sent" });
  });

  it("keeps refusing an account of another tenant, or an admin, as email_taken", async () => {
    const service = createSignInLinkService(deps);
    expect(await codeOf(service.issueForEmail(TENANT, "other@acme.test"))).toBe("email_taken");
    expect(await codeOf(service.issueForEmail(TENANT, "staff@ff.test"))).toBe("email_taken");
    expect(tokens).toHaveLength(0);
  });

  it("refuses an account that has signed in", async () => {
    snapshot = unused({ sessionCount: 1 });
    expect(await codeOf(createSignInLinkService(deps).issueForEmail(TENANT, "owner@acme.test"))).toBe("already_active");
  });
});

describe("listAccounts", () => {
  it("lists the tenant's owners and office users with their sign-in state", async () => {
    deps.store.listTenantAccounts = async () => [
      { ...users.u1, snapshot: unused() },
      { id: "u3", email: "o@acme.test", name: "Ola", role: "office", tenantId: "t1", snapshot: unused({ sessionCount: 1 }) },
      { ...users.a1, tenantId: "t1", snapshot: unused() },
    ];
    expect(await createSignInLinkService(deps).listAccounts("t1")).toEqual([
      { userId: "u1", name: "Olive", email: "owner@acme.test", role: "owner", state: "never_signed_in" },
      { userId: "u3", name: "Ola", email: "o@acme.test", role: "office", state: "signed_in" },
    ]);
  });

  it("answers not_found for an unknown tenant", async () => {
    expect(await codeOf(createSignInLinkService(deps).listAccounts("nope"))).toBe("not_found");
  });
});
