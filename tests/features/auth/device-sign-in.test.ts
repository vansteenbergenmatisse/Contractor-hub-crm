import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createGuards, createInvitedUser, readSession } from "@/features/auth";

// "Open on this device" end to end on Better Auth's memory adapter: the handoff token the /embed
// sign-in answers with, the pairing link a signed-in person asks for, and the redeem that starts a
// first-party session on the other device.
const BASE = "https://app.example.test";
const PASSWORD = "correct horse battery staple";
const YEAR = 60 * 60 * 24 * 365;

type Db = { user: unknown[]; session: unknown[]; account: unknown[]; verification: Array<{ identifier: string; value: string }>; rateLimit: unknown[] };

async function setup(options: { blocked?: (tenantId: string) => Promise<boolean>; deviceSignIn?: boolean } = {}) {
  const db: Db = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  let embedUser = "";
  const auth = createAuth({
    database: memoryAdapter(db as never),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
    embedLogin: { resolveUserId: async () => embedUser },
    isTenantBlocked: options.blocked,
    deviceSignIn: options.deviceSignIn ?? true,
  });
  const guards = createGuards({ getSession: (request) => readSession(auth, request.headers) });
  const owner = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: PASSWORD, role: "owner", tenantId: "A" });
  embedUser = owner.userId;
  return { auth, guards, db, owner, setEmbedUser: (id: string) => (embedUser = id) };
}

let ip = 0;
const nextIp = () => `203.0.113.${(ip = (ip % 250) + 1)}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": nextIp(), ...headers },
    body: JSON.stringify(body),
  });
const cookieHeader = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

async function passwordCookie(auth: Awaited<ReturnType<typeof setup>>["auth"], email = "o@example.test") {
  const response = await auth.handler(post("/sign-in/email", { email, password: PASSWORD, rememberMe: true }));
  expect(response.status).toBe(200);
  return cookieHeader(response);
}

async function handoffToken(auth: Awaited<ReturnType<typeof setup>>["auth"]): Promise<string> {
  const response = await auth.handler(post("/embed-login", { payload: "cipher" }));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { ok: boolean; handoff?: string };
  expect(body.ok).toBe(true);
  return body.handoff as string;
}

async function pairingToken(auth: Awaited<ReturnType<typeof setup>>["auth"], cookie: string): Promise<string> {
  const response = await auth.handler(post("/device-pairing", {}, { cookie }));
  expect(response.status).toBe(200);
  const { link } = (await response.json()) as { link: string };
  return link.split("#t=")[1];
}

const redeem = (auth: Awaited<ReturnType<typeof setup>>["auth"], token: unknown, headers: Record<string, string> = {}) =>
  auth.handler(post("/device-sign-in", { token }, headers));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("handoff from the /embed sign-in", () => {
  it("answers with a 43-character random token next to ok, and stores only its hash", async () => {
    const { auth, db } = await setup();
    const token = await handoffToken(auth);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = db.verification.filter((row) => row.identifier.startsWith("device-sign-in:"));
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(db.verification)).not.toContain(token);
  });

  it("gives no handoff when the device sign-in is not turned on", async () => {
    const { auth } = await setup({ deviceSignIn: false });
    const response = await auth.handler(post("/embed-login", { payload: "cipher" }));
    expect(await response.json()).toEqual({ ok: true });
  });

  it("redeems into a first-party session: SameSite=Lax, Secure, HttpOnly, long-lived, accepted by the guards", async () => {
    const { auth, guards } = await setup();
    const response = await redeem(auth, await handoffToken(auth));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.getSetCookie().find((c) => c.includes("session_token")) ?? "";
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Secure(;|$)/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(Number(/Max-Age=(\d+)/i.exec(cookie)?.[1])).toBe(YEAR);
    const user = await guards.currentUser(new Request(`${BASE}/x`, { headers: { cookie: cookieHeader(response) } }));
    expect(user).toMatchObject({ email: "o@example.test", role: "owner", tenantId: "A" });
  });

  it("works once: a second use of the same token fails", async () => {
    const { auth } = await setup();
    const token = await handoffToken(auth);
    expect((await redeem(auth, token)).status).toBe(200);
    const second = await redeem(auth, token);
    expect(second.status).toBe(403);
    expect(second.headers.getSetCookie()).toEqual([]);
  });

  it("expires after 2 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { auth } = await setup();
    const token = await handoffToken(auth);
    vi.setSystemTime(Date.now() + 121_000);
    expect((await redeem(auth, token)).status).toBe(403);
  });

  it("still works just before 2 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { auth } = await setup();
    const token = await handoffToken(auth);
    vi.setSystemTime(Date.now() + 110_000);
    expect((await redeem(auth, token)).status).toBe(200);
  });
});

describe("pairing a phone or laptop", () => {
  it("gives a signed-in owner a 5-minute link to /device-sign-in with the token in the fragment", async () => {
    const { auth } = await setup();
    const cookie = await passwordCookie(auth);
    const response = await auth.handler(post("/device-pairing", {}, { cookie }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { link: string; expiresAt: string };
    expect(body.link).toMatch(/^https:\/\/app\.example\.test\/device-sign-in#t=[A-Za-z0-9_-]{43}$/);
    const minutes = (new Date(body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(4.9);
    expect(minutes).toBeLessThanOrEqual(5);
  });

  it("signs the other device in as the same person", async () => {
    const { auth, guards } = await setup();
    const token = await pairingToken(auth, await passwordCookie(auth));
    const response = await redeem(auth, token);
    expect(response.status).toBe(200);
    const user = await guards.currentUser(new Request(`${BASE}/x`, { headers: { cookie: cookieHeader(response) } }));
    expect(user).toMatchObject({ email: "o@example.test", tenantId: "A" });
  });

  it("expires after 5 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { auth } = await setup();
    const token = await pairingToken(auth, await passwordCookie(auth));
    vi.setSystemTime(Date.now() + 301_000);
    expect((await redeem(auth, token)).status).toBe(403);
  });

  it("refuses without a session", async () => {
    const { auth } = await setup();
    expect((await auth.handler(post("/device-pairing", {}))).status).toBe(401);
  });

  it("refuses a request from another origin", async () => {
    const { auth } = await setup();
    const cookie = await passwordCookie(auth);
    expect((await auth.handler(post("/device-pairing", {}, { cookie, origin: "https://evil.test" }))).status).toBe(403);
  });

  it("refuses an admin (admins keep their own sign-in; View as client is not a session)", async () => {
    const { auth } = await setup();
    await createInvitedUser(auth, { email: "admin@example.test", name: "Ad", password: PASSWORD, role: "admin", tenantId: null });
    const cookie = await passwordCookie(auth, "admin@example.test");
    expect((await auth.handler(post("/device-pairing", {}, { cookie }))).status).toBe(403);
  });

  it("refuses when the client's login is off", async () => {
    let off = false;
    const { auth } = await setup({ blocked: async () => off });
    const cookie = await passwordCookie(auth);
    off = true;
    expect((await auth.handler(post("/device-pairing", {}, { cookie }))).status).toBe(403);
  });
});

describe("redeem checks", () => {
  it("refuses a token whose account moved to another tenant (wrong user for that tenant)", async () => {
    const { auth, owner } = await setup();
    const token = await handoffToken(auth);
    const context = await auth.$context;
    await context.internalAdapter.updateUser(owner.userId, { tenantId: "B" } as never);
    expect((await redeem(auth, token)).status).toBe(403);
  });

  it("refuses a turned-off user", async () => {
    const { auth, owner } = await setup();
    const token = await handoffToken(auth);
    const context = await auth.$context;
    await context.internalAdapter.updateUser(owner.userId, { disabledAt: new Date() } as never);
    expect((await redeem(auth, token)).status).toBe(403);
  });

  it("refuses when the tenant was blocked after the token was made", async () => {
    let off = false;
    const { auth } = await setup({ blocked: async () => off });
    const token = await handoffToken(auth);
    off = true;
    expect((await redeem(auth, token)).status).toBe(403);
  });

  it("refuses an unknown or malformed token and another origin, with no cookie", async () => {
    const { auth } = await setup();
    const token = await handoffToken(auth);
    for (const response of [
      await redeem(auth, "A".repeat(43)),
      await redeem(auth, "short"),
      await redeem(auth, 42),
      await redeem(auth, token, { origin: "https://evil.test" }),
    ]) {
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    // The cross-origin attempt did not use the token up.
    expect((await redeem(auth, token)).status).toBe(200);
  });

  it("rate limits: the 11th redeem from one address inside a minute answers 429", async () => {
    const { auth } = await setup();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await redeem(auth, "A".repeat(43), { "x-forwarded-for": "198.51.100.7" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 403)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("writes audit lines with outcome and ids, never the token", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { auth } = await setup();
    const token = await handoffToken(auth);
    await redeem(auth, token);
    await redeem(auth, token);
    const lines = info.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("device_"));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) expect(line).not.toContain(token);
    const parsed = lines.map((line) => JSON.parse(line) as { audit: string; outcome: string; reason?: string });
    expect(parsed.map((p) => [p.audit, p.outcome, p.reason])).toEqual([
      ["device_handoff", "issued", undefined],
      ["device_sign_in", "ok", undefined],
      ["device_sign_in", "denied", "invalid_or_used"],
    ]);
  });
});
