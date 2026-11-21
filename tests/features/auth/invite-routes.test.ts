import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, createGuards, handleAcceptInvite, handleCreateInvite, handlePreviewInvite, InviteError, type SessionUser } from "@/features/auth";

// HTTP layer of the invite flow: who may create, what the browser can send, fixed error shapes,
// rate limits and audit lines.
const ORIGIN = "https://crm.example.test";
const admin: SessionUser = { id: "a1", email: "a@x.test", name: "A", role: "admin", tenantId: null };
const owner: SessionUser = { id: "u1", email: "o@x.test", name: "O", role: "owner", tenantId: "A" };
const office: SessionUser = { ...owner, id: "u2", role: "office" };

const service = () => ({
  createInvite: vi.fn(async () => ({ inviteId: "i1", link: `${ORIGIN}/invite/CODE`, email: "p@x.test" })),
  previewInvite: vi.fn(async () => ({ valid: true as const, email: "p@x.test" })),
  acceptInvite: vi.fn(async () => ({ userId: "u9" })),
});
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/admin/invites`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const guards = (user: SessionUser | null) => createGuards({ getSession: async () => user });
const valid = { tenantId: "T1", email: "p@x.test", role: "owner" };
const allow = async () => true;
const previewRequest = () => new Request(`${ORIGIN}/api/invites/CODE`);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("create invite", () => {
  const run = (user: SessionUser | null, request: Request, svc = service(), limiter?: (key: string) => Promise<boolean>) =>
    handleCreateInvite(request, { guards: guards(user), service: svc, appOrigin: ORIGIN, limiter: limiter ?? allow }).then((r) => ({ r, svc }));

  it("lets an admin create an invite and returns the link, uncached", async () => {
    const { r, svc } = await run(admin, post(valid));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ link: `${ORIGIN}/invite/CODE`, email: "p@x.test" });
    expect(svc.createInvite).toHaveBeenCalledWith({ tenantId: "T1", email: "p@x.test", role: "owner", createdById: "a1" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("creates an office invite", async () => {
    const { svc } = await run(admin, post({ ...valid, role: "office" }));
    expect(svc.createInvite).toHaveBeenCalledWith(expect.objectContaining({ role: "office" }));
  });

  it.each([
    ["an owner", owner],
    ["an office user", office],
    ["nobody signed in", null],
    ["a turned-off admin", { ...admin, disabledAt: new Date() }],
  ])("is closed to %s", async (_label, user) => {
    const { r, svc } = await run(user, post(valid));
    expect(r.status).toBe(403);
    expect(svc.createInvite).not.toHaveBeenCalled();
  });

  it("takes createdById from the session, never from the body, and passes no extra keys", async () => {
    const { svc } = await run(admin, post({ ...valid, createdById: "evil", hlUserId: "x", status: "connected" }));
    expect(svc.createInvite).toHaveBeenCalledWith({ tenantId: "T1", email: "p@x.test", role: "owner", createdById: "a1" });
  });

  it.each([
    ["a foreign origin", { origin: "https://evil.test" }],
    ["an empty origin", { origin: "" }],
    ["an origin that extends ours", { origin: `${ORIGIN}.evil.test` }],
    ["an origin that ends with ours", { origin: "https://evil-crm.example.test" }],
  ])("refuses %s", async (_label, headers) => {
    const { r, svc } = await run(admin, post(valid, headers));
    expect(r.status).toBe(403);
    expect(svc.createInvite).not.toHaveBeenCalled();
  });

  it("refuses a request with no Origin header at all", async () => {
    const request = new Request(`${ORIGIN}/api/admin/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valid) });
    expect((await run(admin, request)).r.status).toBe(403);
  });

  it("refuses a non-JSON content type, accepts JSON with a charset", async () => {
    expect((await run(admin, post(valid, { "content-type": "text/plain" }))).r.status).toBe(415);
    expect((await run(admin, post(valid, { "content-type": "application/json; charset=utf-8" }))).r.status).toBe(200);
  });

  it.each([
    ["not json", "not json"],
    ["an empty object", {}],
    ["the admin role", { ...valid, role: "admin" }],
    ["a prototype key as role", { ...valid, role: "constructor" }],
    ["a number as email", { ...valid, email: 5 }],
    ["an empty tenant", { ...valid, tenantId: "" }],
    ["a tenant id over 64 characters", { ...valid, tenantId: "t".repeat(65) }],
    ["a JSON null", "null"],
    ["a JSON array", "[]"],
  ])("answers 400 for %s without calling the service", async (_label, body) => {
    const { r, svc } = await run(admin, post(body));
    expect(r.status).toBe(400);
    expect(svc.createInvite).not.toHaveBeenCalled();
  });

  it("maps service errors to fixed statuses and bodies without details", async () => {
    const table: [string, number][] = [["tenant_unavailable", 404], ["not_eligible", 422], ["email_taken", 409], ["send_failed", 502]];
    for (const [code, status] of table) {
      const svc = service();
      svc.createInvite.mockRejectedValue(new InviteError(code as never));
      const { r } = await run(admin, post(valid), svc);
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ error: code });
    }
  });

  it("hides unknown errors: 500, fixed body, and the log carries the error name only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = service();
    svc.createInvite.mockRejectedValue(new Error("secret connection string"));
    const { r } = await run(admin, post(valid), svc);
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "failed" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret");
  });

  it("is limited per admin: a refused limiter answers 429 before the service runs; a throwing one denies", async () => {
    const seen: string[] = [];
    const denied = await run(admin, post(valid), service(), async (key) => (seen.push(key), false));
    expect(denied.r.status).toBe(429);
    expect(seen).toEqual(["invite-create:a1"]);
    expect(denied.svc.createInvite).not.toHaveBeenCalled();
    const broken = await run(admin, post(valid), service(), async () => { throw new Error("db down"); });
    expect(broken.r.status).toBe(429);
  });

  it("when the limiter allows, it is asked once with the admin key and the call goes through", async () => {
    const seen: string[] = [];
    const { r } = await run(admin, post(valid), service(), async (key) => (seen.push(key), true));
    expect(r.status).toBe(200);
    expect(seen).toEqual(["invite-create:a1"]);
  });

  it("audits a failure with the reason code only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = service();
    svc.createInvite.mockRejectedValue(new InviteError("not_eligible"));
    await run(admin, post(valid), svc);
    expect(JSON.parse(String(info.mock.calls[0][0]))).toEqual({ audit: "invite_create_failed", by: "a1", tenantId: "T1", reason: "not_eligible" });
  });

  it("writes an audit line with ids only (no email, no link)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await run(admin, post(valid));
    const line = String(info.mock.calls[0][0]);
    expect(JSON.parse(line)).toEqual({ audit: "invite_created", by: "a1", tenantId: "T1", inviteId: "i1" });
    expect(line).not.toContain("p@x.test");
    expect(line).not.toContain("CODE");
  });
});

describe("preview", () => {
  it("answers the email for a valid code and a fixed 404 otherwise", async () => {
    const svc = service();
    expect(await (await handlePreviewInvite("CODE", { service: svc, limiter: allow, request: previewRequest() })).json()).toEqual({ email: "p@x.test" });
    svc.previewInvite.mockResolvedValue({ valid: false } as never);
    const miss = await handlePreviewInvite("CODE", { service: svc, limiter: allow, request: previewRequest() });
    expect(miss.status).toBe(404);
    expect(await miss.json()).toEqual({ error: "invalid_invite" });
  });

  it("is limited per client address", async () => {
    vi.stubEnv("VERCEL", "1");
    const seen: string[] = [];
    const request = new Request(`${ORIGIN}/api/invites/CODE`, { headers: { "x-vercel-forwarded-for": "203.0.113.9, 10.0.0.1" } });
    const response = await handlePreviewInvite("CODE", { service: service(), request, limiter: async (key) => (seen.push(key), false) });
    expect(response.status).toBe(429);
    expect(seen).toEqual(["invite-preview:203.0.113.9"]);
  });

  it("hides unknown errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = service();
    svc.previewInvite.mockRejectedValue(new Error("secret"));
    const response = await handlePreviewInvite("CODE", { service: svc, limiter: allow, request: previewRequest() });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});

describe("accept", () => {
  const accept = (body: unknown, svc = service(), headers: Record<string, string> = {}, limiter?: (key: string) => Promise<boolean>) =>
    handleAcceptInvite(post(body, headers), "CODE", { service: svc, appOrigin: ORIGIN, limiter: limiter ?? allow }).then((r) => ({ r, svc }));

  it("accepts with a name and password, and returns no user data", async () => {
    const { r, svc } = await accept({ name: "Pat", password: "correct horse battery" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(svc.acceptInvite).toHaveBeenCalledWith({ code: "CODE", name: "Pat", password: "correct horse battery" });
  });

  it("ignores role, tenant or email sent by the browser", async () => {
    const { svc } = await accept({ name: "Pat", password: "correct horse battery", role: "admin", tenantId: "B", email: "z@x.test" });
    expect(svc.acceptInvite).toHaveBeenCalledWith({ code: "CODE", name: "Pat", password: "correct horse battery" });
  });

  it("maps errors to fixed statuses and bodies that echo nothing", async () => {
    const table: [string, number][] = [["invalid_invite", 404], ["weak_password", 400], ["invalid_name", 400], ["email_taken", 409], ["failed", 500]];
    for (const [code, status] of table) {
      const svc = service();
      svc.acceptInvite.mockRejectedValue(new InviteError(code as never));
      const { r } = await accept({ name: "P", password: "x" }, svc);
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ error: code });
    }
  });

  it("audits a failed accept with the reason code only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const svc = service();
    svc.acceptInvite.mockRejectedValue(new InviteError("invalid_invite"));
    await accept({ name: "P", password: "x" }, svc);
    expect(JSON.parse(String(info.mock.calls[0][0]))).toEqual({ audit: "invite_accept_failed", reason: "invalid_invite" });
  });

  it("hides unknown errors and logs the name only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = service();
    svc.acceptInvite.mockRejectedValue(new Error("secret"));
    const { r } = await accept({ name: "P", password: "x" }, svc);
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("secret");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret");
  });

  it("refuses a wrong origin and a non-JSON body", async () => {
    expect((await accept({ name: "P", password: "x" }, service(), { origin: "https://evil.test" })).r.status).toBe(403);
    expect((await accept({ name: "P", password: "x" }, service(), { "content-type": "text/plain" })).r.status).toBe(415);
  });

  it("is limited per client address, ahead of any work", async () => {
    vi.stubEnv("VERCEL", "1");
    const seen: string[] = [];
    const { r, svc } = await accept({ name: "P", password: "x" }, service(), { "x-forwarded-for": "198.51.100.4" }, async (key) => (seen.push(key), false));
    expect(r.status).toBe(429);
    expect(seen).toEqual(["invite-accept:198.51.100.4"]);
    expect(svc.acceptInvite).not.toHaveBeenCalled();
  });

  it("audits success with the new user id only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await accept({ name: "Pat", password: "correct horse battery" });
    const line = String(info.mock.calls[0][0]);
    expect(JSON.parse(line)).toEqual({ audit: "invite_accepted", userId: "u9" });
    expect(line).not.toContain("correct horse");
  });
});

describe("clientKey", () => {
  const req = (headers: Record<string, string>) => new Request(ORIGIN, { headers });

  it("on Vercel prefers the platform header, then the first x-forwarded-for hop, else one shared bucket", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientKey(req({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientKey(req({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientKey(req({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientKey(req({}))).toBe("unknown");
  });

  it("outside Vercel the forwarded headers are ignored, so a client cannot pick its own bucket", () => {
    vi.stubEnv("VERCEL", "");
    expect(clientKey(req({ "x-forwarded-for": "9.9.9.9" }))).toBe("unknown");
    expect(clientKey(req({ "x-vercel-forwarded-for": "9.9.9.9" }))).toBe("unknown");
  });

  it("a value that is not an IP address never becomes a key", () => {
    vi.stubEnv("VERCEL", "1");
    for (const bad of ["not-an-ip", "1.1.1.1.1", "<script>", "a".repeat(200), ""]) {
      expect(clientKey(req({ "x-forwarded-for": bad }))).toBe("unknown");
    }
  });
});
