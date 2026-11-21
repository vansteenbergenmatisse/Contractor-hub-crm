import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser, setUserDisabled, type EmailMessage } from "@/features/auth";

// Real Better Auth against its in-memory adapter: sign-up closed, invited users can sign in, the
// role and tenant cannot be changed by the user, a disabled user cannot sign in, reset by email.
const SECRET = Buffer.alloc(32, 7).toString("base64");
const BASE = "https://app.example.test";
const PASSWORD = "correct horse battery staple";

type Db = Record<string, Record<string, unknown>[]>;
let db: Db;
let sent: EmailMessage[];
let auth: ReturnType<typeof createAuth>;

beforeEach(() => {
  db = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  sent = [];
  auth = createAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseURL: BASE,
    emailSender: { send: async (m) => (sent.push(m), { delivered: false }) },
  });
});

const json = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, ...headers },
      body: JSON.stringify(body),
    }),
  );

const invite = (over: Partial<Parameters<typeof createInvitedUser>[1]> = {}) =>
  createInvitedUser(auth, { email: "pat@example.test", name: "Pat", password: PASSWORD, role: "owner", tenantId: "tenant_1", ...over });

const cookiesOf = (response: Response) => response.headers.getSetCookie();
const cookieHeader = (response: Response) => cookiesOf(response).map((c) => c.split(";")[0]).join("; ");

describe("sign-up is closed", () => {
  it("rejects the public sign-up endpoint and creates no user", async () => {
    const response = await json("/sign-up/email", { email: "x@example.test", password: PASSWORD, name: "X" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(db.user).toHaveLength(0);
  });
});

describe("invited users", () => {
  it("can sign in with email and password, and the session carries role and tenant", async () => {
    await invite();
    const response = await json("/sign-in/email", { email: "pat@example.test", password: PASSWORD });
    expect(response.status).toBe(200);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(response) }) });
    expect(session?.user).toMatchObject({ email: "pat@example.test", role: "owner", tenantId: "tenant_1" });
  });

  it("stores the email lower-cased and signs in with any casing", async () => {
    await invite({ email: "Pat@Example.TEST" });
    expect(db.user[0].email).toBe("pat@example.test");
    expect((await json("/sign-in/email", { email: "PAT@example.test", password: PASSWORD })).status).toBe(200);
  });

  it("refuses a wrong password and an unknown email with the same status", async () => {
    await invite();
    const wrong = await json("/sign-in/email", { email: "pat@example.test", password: "nope-nope-nope-nope" });
    const unknown = await json("/sign-in/email", { email: "ghost@example.test", password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(wrong.status);
  });

  it("hashes the password (never stored in clear)", async () => {
    await invite();
    const stored = String(db.account[0].password);
    expect(stored).not.toContain(PASSWORD);
    expect(stored.length).toBeGreaterThan(40);
  });

  it("refuses a password under the minimum length", async () => {
    await expect(invite({ password: "short" })).rejects.toThrow();
    expect(db.user).toHaveLength(0);
  });

  it("refuses an owner or office user without a tenant, and an admin with one", async () => {
    await expect(invite({ role: "owner", tenantId: null })).rejects.toThrow();
    await expect(invite({ role: "office", tenantId: "" })).rejects.toThrow();
    await expect(invite({ role: "admin", tenantId: "tenant_1" })).rejects.toThrow();
    await expect(invite({ role: "superuser" as never })).rejects.toThrow();
    expect(db.user).toHaveLength(0);
  });

  it("refuses a second user with the same email", async () => {
    await invite();
    await expect(invite({ email: "PAT@example.test" })).rejects.toThrow();
    expect(db.user).toHaveLength(1);
  });

  it("creates an admin with no tenant", async () => {
    await invite({ email: "staff@example.test", role: "admin", tenantId: null });
    expect(db.user[0]).toMatchObject({ role: "admin", tenantId: null });
  });
});

describe("the user cannot change their own role or tenant", () => {
  it("ignores or rejects role, tenantId and disabledAt in update-user", async () => {
    await invite();
    const signIn = await json("/sign-in/email", { email: "pat@example.test", password: PASSWORD });
    await json("/update-user", { name: "New Name", role: "admin", tenantId: "tenant_2", disabledAt: null }, { cookie: cookieHeader(signIn) });
    expect(db.user[0]).toMatchObject({ role: "owner", tenantId: "tenant_1" });
  });
});

describe("a turned-off user", () => {
  it("cannot sign in, and an existing session stops working", async () => {
    await invite();
    const signIn = await json("/sign-in/email", { email: "pat@example.test", password: PASSWORD });
    const cookie = cookieHeader(signIn);
    await setUserDisabled(auth, String(db.user[0].id), true);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    const again = await json("/sign-in/email", { email: "pat@example.test", password: PASSWORD });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it("can be turned back on", async () => {
    await invite();
    const id = String(db.user[0].id);
    await setUserDisabled(auth, id, true);
    await setUserDisabled(auth, id, false);
    expect((await json("/sign-in/email", { email: "pat@example.test", password: PASSWORD })).status).toBe(200);
  });
});

describe("session cookie", () => {
  it("is HttpOnly, Secure and SameSite=Lax", async () => {
    await invite();
    const response = await json("/sign-in/email", { email: "pat@example.test", password: PASSWORD });
    const session = cookiesOf(response).find((c) => c.includes("session_token")) as string;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });

  it("is long-lived with keep me signed in, and a browser-session cookie without it", async () => {
    await invite();
    const keep = await json("/sign-in/email", { email: "pat@example.test", password: PASSWORD, rememberMe: true });
    const drop = await json("/sign-in/email", { email: "pat@example.test", password: PASSWORD, rememberMe: false });
    const pick = (r: Response) => cookiesOf(r).find((c) => c.includes("session_token")) as string;
    expect(pick(keep)).toMatch(/Max-Age=\d{6,}/i);
    expect(pick(drop)).not.toMatch(/Max-Age|Expires/i);
  });
});

describe("password reset by email", () => {
  it("sends a reset message through the email sender with a link on this app", async () => {
    await invite();
    const response = await json("/request-password-reset", { email: "pat@example.test", redirectTo: `${BASE}/reset-password` });
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ kind: "password_reset", to: "pat@example.test" });
    expect(sent[0].text).toContain(BASE);
  });

  it("answers an unknown email the same way and sends nothing", async () => {
    await invite();
    const known = await json("/request-password-reset", { email: "pat@example.test", redirectTo: `${BASE}/reset-password` });
    const unknown = await json("/request-password-reset", { email: "ghost@example.test", redirectTo: `${BASE}/reset-password` });
    expect(unknown.status).toBe(known.status);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.map((m) => m.to)).toEqual(["pat@example.test"]);
  });
});
