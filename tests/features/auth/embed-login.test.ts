import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createGuards, createInvitedUser, readSession } from "@/features/auth";

// The embed endpoint end to end on Better Auth's memory adapter: the cookie it sets must be accepted
// by the real session mapping and guards, and must carry the attributes an iframe needs.
const BASE = "https://app.example.test";
const URL_ = `${BASE}/api/auth/embed-login`;

async function setup(resolveUserId: (payload: string) => Promise<string | null>) {
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
    embedLogin: { resolveUserId },
  });
  const guards = createGuards({ getSession: (request) => readSession(auth, request.headers) });
  return { auth, guards };
}
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const cookieHeader = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

afterEach(() => vi.restoreAllMocks());

describe("POST /api/auth/embed-login", () => {
  it("starts a session the guards accept, for the user the resolver names", async () => {
    let userId = "";
    const { auth, guards } = await setup(async () => userId);
    ({ userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "A" }));
    const response = await auth.handler(post({ payload: "cipher" }));
    expect(response.status).toBe(200);
    const session = await guards.currentUser(new Request(`${BASE}/x`, { headers: { cookie: cookieHeader(response) } }));
    expect(session).toMatchObject({ email: "o@example.test", role: "owner", tenantId: "A" });
  });

  it("sets the session cookie with SameSite=None, Secure and HttpOnly", async () => {
    let userId = "";
    const { auth } = await setup(async () => userId);
    ({ userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "A" }));
    const response = await auth.handler(post({ payload: "cipher" }));
    const sessionCookie = response.headers.getSetCookie().find((c) => c.includes("session_token")) ?? "";
    expect(sessionCookie).toMatch(/SameSite=None/i);
    expect(sessionCookie).toMatch(/;\s*Secure(;|$)/i); // the attribute, not the __Secure- name prefix
    expect(sessionCookie).toMatch(/HttpOnly/i);
  });

  it("makes a browser-session cookie (no Max-Age, no Expires) and a session that lasts one day, never 30", async () => {
    let userId = "";
    const { auth } = await setup(async () => userId);
    ({ userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "A" }));
    const response = await auth.handler(post({ payload: "cipher" }));
    const sessionCookie = response.headers.getSetCookie().find((c) => c.includes("session_token")) ?? "";
    expect(sessionCookie).not.toMatch(/Max-Age/i);
    expect(sessionCookie).not.toMatch(/Expires/i);
    const sessions = await (await auth.$context).internalAdapter.listSessions(userId, undefined);
    expect(sessions).toHaveLength(1);
    const lifetimeMs = new Date(sessions[0].expiresAt).getTime() - Date.now();
    expect(lifetimeMs).toBeGreaterThan(0);
    expect(lifetimeMs).toBeLessThanOrEqual(24 * 3600 * 1000);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 403 and sets no cookie when the resolver names a user that does not exist", async () => {
    const { auth } = await setup(async () => "ghost-id");
    const response = await auth.handler(post({ payload: "x" }));
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("refuses a request with no Origin header at all", async () => {
    const resolveUserId = vi.fn(async () => "u");
    const { auth } = await setup(resolveUserId);
    const request = new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: "x" }) });
    expect((await auth.handler(request)).status).toBe(403);
    expect(resolveUserId).not.toHaveBeenCalled();
  });

  it("rate limits: the 11th request from one address inside a minute answers 429", async () => {
    const { auth } = await setup(async () => null);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await auth.handler(post({ payload: "x" }, { "x-forwarded-for": "203.0.113.9" }))).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 403)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("writes one audit line per attempt with the outcome and no payload, email or location", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    let userId = "";
    const { auth } = await setup(async (payload) => (payload === "good" ? userId : null));
    ({ userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "A" }));
    await auth.handler(post({ payload: "good" }, { "x-forwarded-for": "203.0.113.1" }));
    await auth.handler(post({ payload: "bad-payload-secret" }, { "x-forwarded-for": "203.0.113.2" }));
    await auth.handler(post({ payload: "x" }, { origin: "https://evil.test", "x-forwarded-for": "203.0.113.3" }));
    const lines = info.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("embed_login"));
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { audit: "embed_login", outcome: "ok", userId },
      { audit: "embed_login", outcome: "denied", reason: "no_match" },
      { audit: "embed_login", outcome: "denied", reason: "origin" },
    ]);
    for (const line of lines) expect(line).not.toMatch(/o@example|bad-payload-secret|loc_/);
    info.mockRestore();
  });

  it("passes the payload to the resolver untouched", async () => {
    const resolveUserId = vi.fn(async () => null);
    const { auth } = await setup(resolveUserId);
    await auth.handler(post({ payload: "abc==" }));
    expect(resolveUserId).toHaveBeenCalledWith("abc==");
  });

  it("answers 403 with no cookie when the resolver finds nobody or throws", async () => {
    for (const resolver of [async () => null, async () => { throw new Error("db down"); }]) {
      const { auth } = await setup(resolver);
      const response = await auth.handler(post({ payload: "x" }));
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });

  it("refuses a missing or foreign Origin without calling the resolver", async () => {
    const resolveUserId = vi.fn(async () => "u");
    const { auth } = await setup(resolveUserId);
    for (const origin of ["https://evil.test", ""]) {
      const response = await auth.handler(post({ payload: "x" }, { origin }));
      expect(response.status).toBe(403);
    }
    expect(resolveUserId).not.toHaveBeenCalled();
  });

  it("rejects a body without a string payload, and an oversized payload, before the resolver", async () => {
    const resolveUserId = vi.fn(async () => "u");
    const { auth } = await setup(resolveUserId);
    for (const body of [{}, { payload: 5 }, { payload: "" }, { payload: "A".repeat(8193) }]) {
      expect((await auth.handler(post(body))).status).toBe(400);
    }
    expect((await auth.handler(post("not json"))).status).toBeGreaterThanOrEqual(400);
    expect(resolveUserId).not.toHaveBeenCalled();
  });

  it("gives no session to a user who was turned off", async () => {
    let userId = "";
    const { auth, guards } = await setup(async () => userId);
    ({ userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "A" }));
    await (await auth.$context).internalAdapter.updateUser(userId, { disabledAt: new Date() } as never);
    const response = await auth.handler(post({ payload: "x" }));
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    const session = await guards.currentUser(new Request(`${BASE}/x`, { headers: { cookie: cookieHeader(response) } }));
    expect(session).toBeNull();
  });

  it("is not available when no embed login is configured", async () => {
    const auth = createAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
      secret: Buffer.alloc(32, 7).toString("base64"),
      baseURL: BASE,
      emailSender: { send: async () => ({ delivered: false }) },
    });
    expect((await auth.handler(post({ payload: "x" }))).status).toBe(404);
  });

  it("never answers with the user or the payload", async () => {
    let userId = "";
    const { auth } = await setup(async () => userId);
    ({ userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "A" }));
    const text = await (await auth.handler(post({ payload: "secret-cipher" }))).text();
    expect(text).not.toContain("o@example.test");
    expect(text).not.toContain("secret-cipher");
  });
});
