import { describe, expect, it } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser } from "@/features/auth";

// "Log in once at onboarding": a keep-me-signed-in session lasts a year and renews while it is used.
const BASE = "https://app.example.test";
const PASSWORD = "correct horse battery staple";
const YEAR = 60 * 60 * 24 * 365;

async function signIn() {
  const db = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
  });
  await createInvitedUser(auth, { email: "pat@example.test", name: "Pat", password: PASSWORD, role: "owner", tenantId: "tenant_1" });
  const response = await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email: "pat@example.test", password: PASSWORD, rememberMe: true }),
    }),
  );
  return { auth, response, db };
}

describe("session lifetime", () => {
  it("keeps a keep-me-signed-in cookie for one year", async () => {
    const { response } = await signIn();
    const cookie = response.headers.getSetCookie().find((c) => c.includes("session_token")) as string;
    expect(Number(/Max-Age=(\d+)/i.exec(cookie)?.[1])).toBe(YEAR);
  });

  it("stores the session with an expiry about a year ahead", async () => {
    const { db } = await signIn();
    const expiresAt = (db.session[0] as { expiresAt: Date }).expiresAt.getTime();
    expect(Math.abs(expiresAt - (Date.now() + YEAR * 1000))).toBeLessThan(60_000);
  });
});
