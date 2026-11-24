import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser } from "@/features/auth";

// The preview behind /device-sign-in: before the tap, the page asks who and which business a link signs
// in, without spending the token. It answers only a masked email, the business name and whether this
// browser is already signed in as that person. Every failure is the same 403 as the redeem.
const BASE = "https://app.example.test";
const PASSWORD = "correct horse battery staple";

type Db = { user: unknown[]; session: unknown[]; account: unknown[]; verification: Array<{ identifier: string; value: string }>; rateLimit: unknown[] };

async function setup(options: { blocked?: (tenantId: string) => Promise<boolean>; tenantName?: (tenantId: string) => Promise<string | null> } = {}) {
  const db: Db = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  let embedUser = "";
  const auth = createAuth({
    database: memoryAdapter(db as never),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
    embedLogin: { resolveUserId: async () => embedUser },
    isTenantBlocked: options.blocked,
    tenantName: options.tenantName ?? (async (tenantId) => (tenantId === "A" ? "Green Lane Roofing" : null)),
    deviceSignIn: true,
  });
  const owner = await createInvitedUser(auth, { email: "olivia.private@example.test", name: "O", password: PASSWORD, role: "owner", tenantId: "A" });
  const other = await createInvitedUser(auth, { email: "bob@example.test", name: "B", password: PASSWORD, role: "office", tenantId: "A" });
  embedUser = owner.userId;
  return { auth, db, owner, other };
}

type Auth = Awaited<ReturnType<typeof setup>>["auth"];

let ip = 0;
const nextIp = () => `203.0.113.${(ip = (ip % 250) + 1)}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": nextIp(), ...headers },
    body: JSON.stringify(body),
  });
const cookieHeader = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

async function passwordCookie(auth: Auth, email: string) {
  const response = await auth.handler(post("/sign-in/email", { email, password: PASSWORD, rememberMe: true }));
  expect(response.status).toBe(200);
  return cookieHeader(response);
}

async function handoffToken(auth: Auth): Promise<string> {
  const response = await auth.handler(post("/embed-login", { payload: "cipher" }));
  return ((await response.json()) as { handoff: string }).handoff;
}

async function pairingToken(auth: Auth, cookie: string): Promise<string> {
  const response = await auth.handler(post("/device-pairing", {}, { cookie }));
  return ((await response.json()) as { link: string }).link.split("#t=")[1];
}

const preview = (auth: Auth, token: unknown, headers: Record<string, string> = {}) => auth.handler(post("/device-sign-in-preview", { token }, headers));
const redeem = (auth: Auth, token: unknown) => auth.handler(post("/device-sign-in", { token }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("device sign-in preview", () => {
  it("names the masked person, the business and the kind, and does not spend the token", async () => {
    const { auth } = await setup();
    const token = await handoffToken(auth);
    const response = await preview(auth, token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.json()).toEqual({ kind: "handoff", person: "o•••@example.test", business: "Green Lane Roofing", sameAsCurrent: null });
    // Preview again, then the redeem still works exactly once.
    expect((await preview(auth, token)).status).toBe(200);
    expect((await redeem(auth, token)).status).toBe(200);
    expect((await redeem(auth, token)).status).toBe(403);
    expect((await preview(auth, token)).status).toBe(403);
  });

  it("never returns the full email, ids or the token", async () => {
    const { auth, owner } = await setup();
    const token = await handoffToken(auth);
    const text = await (await preview(auth, token)).text();
    expect(text).not.toContain("olivia.private");
    expect(text).not.toContain(owner.userId);
    expect(text).not.toContain(token);
    expect(text).not.toContain('"A"');
  });

  it("gives a null business when the name is unknown or the lookup fails", async () => {
    const { auth } = await setup({ tenantName: async () => { throw new Error("db down"); } });
    const body = (await (await preview(auth, await handoffToken(auth))).json()) as { business: unknown };
    expect(body.business).toBeNull();
  });

  it("says whether this browser is already signed in as that person", async () => {
    const { auth } = await setup();
    const ownerCookie = await passwordCookie(auth, "olivia.private@example.test");
    const otherCookie = await passwordCookie(auth, "bob@example.test");
    const token = await pairingToken(auth, ownerCookie);
    const same = (await (await preview(auth, token, { cookie: ownerCookie })).json()) as { sameAsCurrent: unknown; kind: unknown };
    expect(same).toMatchObject({ kind: "pairing", sameAsCurrent: true });
    const other = (await (await preview(auth, token, { cookie: otherCookie })).json()) as { sameAsCurrent: unknown };
    expect(other.sameAsCurrent).toBe(false);
    const none = (await (await preview(auth, token)).json()) as { sameAsCurrent: unknown };
    expect(none.sameAsCurrent).toBeNull();
  });

  it("refuses an expired token with the fixed 403", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { auth } = await setup();
    const token = await handoffToken(auth);
    vi.setSystemTime(Date.now() + 121_000);
    const response = await preview(auth, token);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: "Forbidden" });
  });

  it("refuses a token whose account moved to another tenant", async () => {
    const { auth, owner } = await setup();
    const token = await handoffToken(auth);
    const context = await auth.$context;
    await context.internalAdapter.updateUser(owner.userId, { tenantId: "B" } as never);
    expect((await preview(auth, token)).status).toBe(403);
  });

  it("refuses when the tenant is blocked", async () => {
    let off = false;
    const { auth } = await setup({ blocked: async () => off });
    const token = await handoffToken(auth);
    off = true;
    expect((await preview(auth, token)).status).toBe(403);
  });

  it("refuses another origin, an unknown and a malformed token, all with the same answer", async () => {
    const { auth } = await setup();
    const token = await handoffToken(auth);
    const bodies: string[] = [];
    for (const response of [
      await preview(auth, token, { origin: "https://evil.test" }),
      await preview(auth, "A".repeat(43)),
      await preview(auth, "short"),
      await preview(auth, 42),
    ]) {
      expect(response.status).toBe(403);
      bodies.push(await response.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect((await redeem(auth, token)).status).toBe(200);
  });

  it("is rate limited like the redeem", async () => {
    const { auth } = await setup();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await preview(auth, "A".repeat(43), { "x-forwarded-for": "198.51.100.9" })).status);
    expect(statuses[10]).toBe(429);
  });

  it("writes audit lines without the email or the token", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { auth } = await setup();
    const token = await handoffToken(auth);
    await preview(auth, token);
    await preview(auth, "A".repeat(43));
    const lines = info.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("device_sign_in_preview"));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain(token);
      expect(line).not.toContain("example.test");
    }
    expect(lines.map((line) => (JSON.parse(line) as { outcome: string }).outcome)).toEqual(["ok", "denied"]);
  });
});
