import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser, type EmailMessage } from "@/features/auth";

// A user the onboarding sync created (random password nobody knows) can get in: by Forgot password,
// and by the set-password link an admin issues (stored in Better Auth's own token format).
const SECRET = Buffer.alloc(32, 9).toString("base64");
const BASE = "https://crm.example.test";
const NEW_PASSWORD = "a brand new password";

type Db = Record<string, Record<string, unknown>[]>;
let db: Db;
let sent: EmailMessage[];
let auth: ReturnType<typeof createAuth>;
let tenantName: (tenantId: string) => Promise<string | null>;

beforeEach(() => {
  db = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  sent = [];
  tenantName = async (id) => (id === "tenant_1" ? "Green Acres" : null);
  auth = createAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseURL: BASE,
    appUrl: BASE,
    emailSender: { send: async (m) => (sent.push(m), { delivered: true }) },
    tenantName: (id) => tenantName(id),
  });
});

const post = (path: string, body: unknown) =>
  auth.handler(new Request(`${BASE}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) }));

// The sync's way: an account with a random first password.
const synced = () =>
  createInvitedUser(auth, { email: "owner@acme.test", name: "Olive", password: randomBytes(32).toString("base64url"), role: "owner", tenantId: "tenant_1" });

const tokenFrom = (text: string) => {
  const match = text.match(/reset-password\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("no token in mail");
  return match[1];
};

describe("Forgot password for a synced user who never set a password", () => {
  it("mails a set-password text naming the business, and the link sets the password", async () => {
    await synced();
    expect((await post("/request-password-reset", { email: "owner@acme.test", redirectTo: `${BASE}/reset-password` })).status).toBe(200);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ kind: "password_reset", to: "owner@acme.test", subject: "Choose your password for Green Acres" });
    expect(sent[0].text).toContain("expires in 24 hours");
    expect(sent[0].text).toContain(`${BASE}/sign-in`);

    expect((await post("/reset-password", { newPassword: NEW_PASSWORD, token: tokenFrom(sent[0].text) })).status).toBe(200);
    expect((await post("/sign-in/email", { email: "owner@acme.test", password: NEW_PASSWORD })).status).toBe(200);
  });

  it("still mails when the business name cannot be read", async () => {
    tenantName = async () => { throw new Error("db down"); };
    await synced();
    await post("/request-password-reset", { email: "owner@acme.test", redirectTo: `${BASE}/reset-password` });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].subject).toBe("Choose your password");
  });
});

describe("the admin-issued set-password token", () => {
  it("is accepted by Better Auth's reset endpoint, once", async () => {
    const { userId } = await synced();
    const context = await auth.$context;
    await context.internalAdapter.createVerificationValue({ identifier: "reset-password:ADMIN_TOKEN", value: userId, expiresAt: new Date(Date.now() + 3600_000) });
    expect((await post("/reset-password", { newPassword: NEW_PASSWORD, token: "ADMIN_TOKEN" })).status).toBe(200);
    expect((await post("/sign-in/email", { email: "owner@acme.test", password: NEW_PASSWORD })).status).toBe(200);
    expect((await post("/reset-password", { newPassword: "another password 2", token: "ADMIN_TOKEN" })).status).toBe(400);
  });
});
