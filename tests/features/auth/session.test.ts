import { describe, expect, it } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createGuards, createInvitedUser, readSession } from "@/features/auth";

// The real session mapping (Better Auth user -> guards' SessionUser) on the memory adapter, end to
// end: sign in, then ask the guards. A dropped field here would pass every guard test that injects a
// fake session.
const BASE = "https://app.example.test";
const PASSWORD = "correct horse battery staple";

async function setup() {
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
  });
  const guards = createGuards({ getSession: (request) => readSession(auth, request.headers) });
  const signIn = async (email: string) => {
    const response = await auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, password: PASSWORD }),
    }));
    const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return new Request(`${BASE}/x`, { headers: { cookie } });
  };
  return { auth, guards, signIn };
}

describe("readSession with the guards", () => {
  it("an owner of tenant A: signed in, not admin, tenant A, and tenant B is 404", async () => {
    const { auth, guards, signIn } = await setup();
    await createInvitedUser(auth, { email: "o@example.test", name: "O", password: PASSWORD, role: "owner", tenantId: "A" });
    const request = await signIn("o@example.test");
    expect(await guards.currentUser(request)).toMatchObject({ email: "o@example.test", role: "owner", tenantId: "A" });
    expect(await guards.isAdmin(request)).toBe(false);
    expect((await guards.tenantOf(request)).tenantId).toBe("A");
    expect((await guards.tenantOf(request, "B").catch((e) => e)).status).toBe(404);
  });

  it("an admin: admin id given, no tenant data (403)", async () => {
    const { auth, guards, signIn } = await setup();
    const { userId } = await createInvitedUser(auth, { email: "a@example.test", name: "A", password: PASSWORD, role: "admin", tenantId: null });
    const request = await signIn("a@example.test");
    expect(await guards.isAdmin(request)).toBe(true);
    expect(await guards.adminId(request)).toBe(userId);
    expect((await guards.tenantOf(request).catch((e) => e)).status).toBe(403);
  });

  it("an admin turned off after sign-in loses admin rights at once (disabledAt is mapped)", async () => {
    const { auth, guards, signIn } = await setup();
    const { userId } = await createInvitedUser(auth, { email: "a@example.test", name: "A", password: PASSWORD, role: "admin", tenantId: null });
    const request = await signIn("a@example.test");
    expect(await guards.isAdmin(request)).toBe(true);
    // Mark disabled without ending the session, to prove the guard itself checks the field.
    await (await auth.$context).internalAdapter.updateUser(userId, { disabledAt: new Date() } as never);
    expect(await guards.isAdmin(request)).toBe(false);
    expect(await guards.adminId(request)).toBeNull();
    expect(await guards.currentUser(request)).toBeNull();
  });

  it("no cookie means no user", async () => {
    const { guards } = await setup();
    expect(await guards.currentUser(new Request(`${BASE}/x`))).toBeNull();
  });
});
