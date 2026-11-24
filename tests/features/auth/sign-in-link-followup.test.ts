import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser, createResetTokenStore, createSignInLinkService, InviteError, type SignInLinkDeps } from "@/features/auth";

// Follow-ups to the owner-access review: the REAL replaceResetToken (Better Auth's adapter, here the
// memory adapter) against Better Auth's reset endpoint, the re-check after the link is stored, and an
// unreadable mail budget reported as "unknown", never as "capped".
const SECRET = Buffer.alloc(32, 7).toString("base64");
const BASE = "https://crm.example.test";
const TENANT = { id: "tenant_1", name: "Green Acres", locationId: "loc_1", companyId: "co_1", status: "connected" as const, loginDisabledAt: null };
const FP = "fp";

type Db = Record<string, Record<string, unknown>[]>;
let db: Db;
let auth: ReturnType<typeof createAuth>;

beforeEach(() => {
  db = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  auth = createAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseURL: BASE,
    appUrl: BASE,
    emailSender: { send: async () => ({ delivered: true }) },
  });
});

const post = (path: string, body: unknown) =>
  auth.handler(new Request(`${BASE}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) }));
const resetWith = (token: string, password = "a brand new password") => post("/reset-password", { newPassword: password, token });
const synced = (email = "owner@acme.test") =>
  createInvitedUser(auth, { email, name: "Olive", password: randomBytes(32).toString("base64url"), role: "owner", tenantId: TENANT.id });

describe("createResetTokenStore (the real replaceResetToken)", () => {
  it("stores a token Better Auth's reset endpoint accepts", async () => {
    const { userId } = await synced();
    await createResetTokenStore(auth).replaceResetToken(userId, "TOKEN_1", new Date(Date.now() + 3600_000));
    expect((await resetWith("TOKEN_1")).status).toBe(200);
    expect((await post("/sign-in/email", { email: "owner@acme.test", password: "a brand new password" })).status).toBe(200);
  });

  it("a new link replaces the older one: only the newest works", async () => {
    const { userId } = await synced();
    const store = createResetTokenStore(auth);
    await store.replaceResetToken(userId, "OLD", new Date(Date.now() + 3600_000));
    await store.replaceResetToken(userId, "NEW", new Date(Date.now() + 3600_000));
    expect((await resetWith("OLD")).status).toBe(400);
    expect((await resetWith("NEW")).status).toBe(200);
  });

  it("leaves other people's links and other verification rows alone", async () => {
    const { userId } = await synced();
    const other = await synced("other@acme.test");
    const store = createResetTokenStore(auth);
    await store.replaceResetToken(other.userId, "OTHER", new Date(Date.now() + 3600_000));
    db.verification.push({ id: "v_other_kind", identifier: "email-verification:x", value: userId, expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date(), updatedAt: new Date() });
    await store.replaceResetToken(userId, "MINE", new Date(Date.now() + 3600_000));
    expect(db.verification.map((row) => row.identifier).sort()).toEqual(["email-verification:x", "reset-password:MINE", "reset-password:OTHER"]);
    expect((await resetWith("OTHER", "another new password 1")).status).toBe(200);
  });

  it("deleteResetTokens withdraws every set-password link of the person", async () => {
    const { userId } = await synced();
    const store = createResetTokenStore(auth);
    await store.replaceResetToken(userId, "GONE", new Date(Date.now() + 3600_000));
    await store.deleteResetTokens(userId);
    expect((await resetWith("GONE")).status).toBe(400);
  });
});

describe("issuing a link with the real store", () => {
  type Snapshot = NonNullable<Awaited<ReturnType<SignInLinkDeps["store"]["readSnapshot"]>>>;
  const unused: Snapshot = {
    role: "owner",
    tenantId: TENANT.id,
    disabledAt: null,
    linkDeletedAt: null,
    marker: { tenantId: TENANT.id, credentialFingerprint: FP },
    credentials: [{ providerId: "credential", passwordFingerprint: FP }],
    sessionCount: 0,
  };

  async function service(snapshots: Snapshot[], over: Partial<SignInLinkDeps> = {}) {
    const { userId } = await synced();
    const sent: unknown[] = [];
    const readSnapshot = vi.fn(async () => (snapshots.length > 1 ? snapshots.shift()! : snapshots[0]));
    const deps: SignInLinkDeps = {
      now: () => new Date(),
      appUrl: BASE,
      emailSender: { send: async (m) => (sent.push(m), { delivered: true }) },
      checkEligibility: async () => ({ eligible: true, hlUserId: "hl_1" }),
      newToken: () => "ISSUED",
      store: {
        findTenant: async () => TENANT,
        findUserByEmail: async () => ({ id: userId, email: "owner@acme.test", name: "Olive", role: "owner", tenantId: TENANT.id }),
        findUserById: async () => ({ id: userId, email: "owner@acme.test", name: "Olive", role: "owner", tenantId: TENANT.id }),
        readSnapshot,
        listTenantAccounts: async () => [],
        ...createResetTokenStore(auth),
      },
      ...over,
    };
    return { svc: createSignInLinkService(deps), sent, readSnapshot, userId };
  }

  it("a never-used account gets a working link", async () => {
    const { svc } = await service([unused]);
    const result = await svc.issueForEmail(TENANT, "owner@acme.test");
    expect(result.mail).toBe("sent");
    expect((await resetWith("ISSUED")).status).toBe(200);
  });

  it("an account signed in between the check and the write: the link is withdrawn, nothing is mailed", async () => {
    const { svc, sent, readSnapshot } = await service([unused, { ...unused, sessionCount: 1 }]);
    const error = await svc.issueForEmail(TENANT, "owner@acme.test").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InviteError);
    expect((error as InviteError).code).toBe("already_active");
    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(0);
    expect(db.verification.filter((row) => String(row.identifier).startsWith("reset-password:"))).toHaveLength(0);
    expect((await resetWith("ISSUED")).status).toBe(400);
  });

  it("an account blocked in that gap answers account_disabled and the link is withdrawn", async () => {
    const { svc } = await service([unused, { ...unused, disabledAt: new Date() }]);
    const error = await svc.sendForUser({ tenantId: TENANT.id, userId: "any" }).catch((e: unknown) => e);
    expect((error as InviteError).code).toBe("account_disabled");
    expect((await resetWith("ISSUED")).status).toBe(400);
  });

  it("an unreadable mail budget reports unknown (not capped) and still returns a working link", async () => {
    const { svc, sent } = await service([unused], {
      mailBudget: async () => {
        throw new Error("budget unreadable");
      },
    });
    const result = await svc.issueForEmail(TENANT, "owner@acme.test");
    expect(result.mail).toBe("unknown");
    expect(result.link).toContain("ISSUED");
    expect(sent).toHaveLength(0);
    expect((await resetWith("ISSUED")).status).toBe(200);
  });

  it("a budget that is used up still reports capped", async () => {
    const { svc } = await service([unused], { mailBudget: async () => {} });
    expect((await svc.issueForEmail(TENANT, "owner@acme.test")).mail).toBe("capped");
  });
});
