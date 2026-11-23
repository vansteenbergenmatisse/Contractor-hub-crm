import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyClientView,
  clientViewCookieName,
  createGuards,
  handleExitClientView,
  handleStartClientView,
  signClientView,
  type SessionUser,
} from "@/features/auth";

const ORIGIN = "https://crm.example.test";
const SECRET = "test-secret-for-client-view-000000";
const NOW = new Date("2026-11-22T12:00:00.000Z");
const admin: SessionUser = { id: "a1", email: "a@x.test", name: "A", role: "admin", tenantId: null };
const owner: SessionUser = { id: "u1", email: "o@x.test", name: "O", role: "owner", tenantId: "T9" };

const post = (path: string, headers: Record<string, string> = { origin: ORIGIN }) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers });

function startDeps(user: SessionUser | null, overrides: Record<string, unknown> = {}) {
  return {
    guards: createGuards({ getSession: async () => user }),
    limiter: vi.fn(async () => true),
    isTenantUnavailable: vi.fn(async () => false),
    appOrigin: ORIGIN,
    secret: SECRET,
    now: () => NOW,
    disabled: false,
    ...overrides,
  };
}

const viewDeps = (overrides: Record<string, unknown> = {}) => ({
  secret: SECRET,
  now: () => NOW,
  isTenantUnavailable: vi.fn(async () => false),
  disabled: false,
  ...overrides,
});

const token = (adminId = "a1", tenantId = "T1", at = NOW) => signClientView({ adminId, tenantId }, SECRET, at);

afterEach(() => vi.restoreAllMocks());

describe("handleStartClientView", () => {
  it("sets a private signed cookie for an admin and a live client", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await handleStartClientView(post("/api/admin/clients/T1/view"), "T1", startDeps(admin));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie.startsWith(`${clientViewCookieName(ORIGIN)}=`)).toBe(true);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=3600/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([["owner", owner], ["signed out", null]])("refuses %s", async (_label, user) => {
    const response = await handleStartClientView(post("/api/admin/clients/T1/view"), "T1", startDeps(user));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses another origin", async () => {
    const request = post("/api/admin/clients/T1/view", { origin: "https://evil.example.test" });
    expect((await handleStartClientView(request, "T1", startDeps(admin))).status).toBe(403);
  });

  it("answers 429 when the limiter refuses or fails", async () => {
    const refused = startDeps(admin, { limiter: vi.fn(async () => false) });
    expect((await handleStartClientView(post("/x"), "T1", refused)).status).toBe(429);
    const broken = startDeps(admin, { limiter: vi.fn(async () => { throw new Error("db"); }) });
    expect((await handleStartClientView(post("/x"), "T1", broken)).status).toBe(429);
  });

  it.each(["", "a".repeat(65), "T1;x", "../T1"])("rejects the malformed tenant id %j", async (tenantId) => {
    expect((await handleStartClientView(post("/x"), tenantId, startDeps(admin))).status).toBe(400);
  });

  it("answers 404 for a missing or uninstalled client, and when the check fails", async () => {
    const gone = startDeps(admin, { isTenantUnavailable: vi.fn(async () => true) });
    expect((await handleStartClientView(post("/x"), "T1", gone)).status).toBe(404);
    const broken = startDeps(admin, { isTenantUnavailable: vi.fn(async () => { throw new Error("db"); }) });
    expect((await handleStartClientView(post("/x"), "T1", broken)).status).toBe(404);
  });

  it("answers 404 with the kill switch on", async () => {
    expect((await handleStartClientView(post("/x"), "T1", startDeps(admin, { disabled: true }))).status).toBe(404);
  });

  it("writes an audit line with ids only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await handleStartClientView(post("/x"), "T1", startDeps(admin));
    const line = JSON.parse(String(info.mock.calls[0][0]));
    expect(line).toEqual({ audit: "client_view_started", by: "a1", tenantId: "T1" });
  });
});

describe("handleExitClientView", () => {
  it("clears the cookie", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await handleExitClientView(post("/api/admin/view/exit"), startDeps(admin));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });

  it("refuses another origin", async () => {
    const request = post("/api/admin/view/exit", { origin: "https://evil.example.test" });
    expect((await handleExitClientView(request, startDeps(admin))).status).toBe(403);
  });
});

describe("applyClientView", () => {
  it("gives an admin the viewed tenant and marks the view", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const user = await applyClientView(admin, token(), viewDeps());
    expect(user).toEqual({ ...admin, tenantId: "T1", viewing: true });
  });

  it("logs each privileged read with ids only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await applyClientView(admin, token(), viewDeps());
    expect(JSON.parse(String(info.mock.calls[0][0]))).toEqual({ audit: "client_view_read", by: "a1", tenantId: "T1" });
  });

  it("never changes a non-admin, even with a valid token", async () => {
    expect(await applyClientView(owner, token("u1"), viewDeps())).toEqual(owner);
  });

  it("returns null for signed out", async () => {
    expect(await applyClientView(null, token(), viewDeps())).toBeNull();
  });

  it("ignores a token made for another admin", async () => {
    expect(await applyClientView(admin, token("a2"), viewDeps())).toEqual(admin);
  });

  it("ignores an expired token", async () => {
    const old = token("a1", "T1", new Date(NOW.getTime() - 3600_000));
    expect(await applyClientView(admin, old, viewDeps())).toEqual(admin);
  });

  it("ignores a tampered tenant and a wrong secret", async () => {
    const [, signature] = token().split(".");
    const forged = Buffer.from(JSON.stringify({ a: "a1", t: "T2", e: NOW.getTime() + 1000 })).toString("base64url");
    expect(await applyClientView(admin, `${forged}.${signature}`, viewDeps())).toEqual(admin);
    const other = signClientView({ adminId: "a1", tenantId: "T1" }, "another-secret-000000000000000000", NOW);
    expect(await applyClientView(admin, other, viewDeps())).toEqual(admin);
  });

  it.each(["", "abc", "a.b.c", "%%%.###"])("ignores the malformed token %j", async (value) => {
    expect(await applyClientView(admin, value, viewDeps())).toEqual(admin);
  });

  it("ignores the view when the client is gone, the check fails or the kill switch is on", async () => {
    expect(await applyClientView(admin, token(), viewDeps({ isTenantUnavailable: vi.fn(async () => true) }))).toEqual(admin);
    expect(
      await applyClientView(admin, token(), viewDeps({ isTenantUnavailable: vi.fn(async () => { throw new Error("db"); }) })),
    ).toEqual(admin);
    expect(await applyClientView(admin, token(), viewDeps({ disabled: true }))).toEqual(admin);
  });

  it("does not grant write access: the route guards still see a tenantless admin", async () => {
    const guards = createGuards({ getSession: async () => admin });
    const request = new Request(`${ORIGIN}/api/x`, { headers: { cookie: `${clientViewCookieName(ORIGIN)}=${token()}` } });
    await expect(guards.tenantOf(request)).rejects.toMatchObject({ status: 403 });
  });
});
