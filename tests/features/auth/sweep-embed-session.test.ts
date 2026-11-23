import { describe, expect, it } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser } from "@/features/auth";

// Bug sweep 2026-11-23, A5: inside a cross-site iframe only SameSite=None cookies are sent, so the
// "do not remember" cookie must be one too, or the first session read extends the session to a year.
const BASE = "https://app.example.test";
const DAY_MS = 24 * 3600 * 1000;

describe("embed session lifetime in a cross-site iframe", () => {
  it("stays at most one day after a session read that carries only SameSite=None cookies", async () => {
    let userId = "";
    const auth = createAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
      secret: Buffer.alloc(32, 7).toString("base64"),
      baseURL: BASE,
      emailSender: { send: async () => ({ delivered: false }) },
      embedLogin: { resolveUserId: async () => userId },
    });
    ({ userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "A" }));
    const login = await auth.handler(new Request(`${BASE}/api/auth/embed-login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ payload: "cipher" }),
    }));
    expect(login.status).toBe(200);
    // The browser keeps the last Set-Cookie per name, and sends only SameSite=None ones in the iframe.
    const jar = new Map(login.headers.getSetCookie().map((c) => [c.split("=")[0], c]));
    const cookie = [...jar.values()].filter((c) => /SameSite=None/i.test(c)).map((c) => c.split(";")[0]).join("; ");
    expect(cookie).toContain("dont_remember");
    await auth.api.getSession({ headers: new Headers({ cookie }) });
    const sessions = await (await auth.$context).internalAdapter.listSessions(userId, undefined);
    expect(new Date(sessions[0].expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(DAY_MS);
  });
});
