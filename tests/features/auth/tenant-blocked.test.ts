import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser } from "@/features/auth";

const BASE = "https://app.example.test";
const PASSWORD = "correct horse battery staple";
afterEach(() => vi.restoreAllMocks());

async function signIn(isTenantBlocked?: (tenantId: string) => Promise<boolean>) {
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
    isTenantBlocked,
  });
  await createInvitedUser(auth, { email: "pat@example.test", name: "Pat", password: PASSWORD, role: "owner", tenantId: "t1" });
  return auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: "pat@example.test", password: PASSWORD }),
  }));
}

describe("sign-in of a user whose tenant was uninstalled", () => {
  it("gets no session", async () => {
    const response = await signIn(async () => true);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.getSetCookie().some((c) => c.includes("session_token=") && !/Max-Age=0/.test(c))).toBe(false);
  });

  it("is asked with the user's tenant id", async () => {
    const seen: string[] = [];
    await signIn(async (id) => (seen.push(id), false));
    expect(seen).toEqual(["t1"]);
  });

  it("fails closed when the tenant lookup throws", async () => {
    const response = await signIn(async () => { throw new Error("db"); });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("works as before for a connected tenant and when no check is configured", async () => {
    expect((await signIn(async () => false)).status).toBe(200);
    expect((await signIn()).status).toBe(200);
  });
});
