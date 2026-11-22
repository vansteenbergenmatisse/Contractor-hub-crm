import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser } from "@/features/auth";

// A session from the embed sign-in is bound to the tenant the payload was resolved for: if the account
// moved to another client in between, no session may survive and no cookie may be sent.
const BASE = "https://app.example.test";
type Confirm = (input: { userId: string; tenantId: string; sessionToken: string }) => Promise<boolean>;

async function setup(confirmSession: Confirm, bound = true) {
  let userId = "";
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
    embedLogin: { resolveUserId: async () => (bound ? { userId, tenantId: "tenant-a" } : userId), confirmSession },
  });
  ({ userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "tenant-a" }));
  const response = await auth.handler(new Request(`${BASE}/api/auth/embed-login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ payload: "cipher" }),
  }));
  const sessions = await (await auth.$context).internalAdapter.listSessions(userId, undefined);
  return { response, sessions, userId };
}

afterEach(() => vi.restoreAllMocks());

describe("embed session bound to the resolved tenant", () => {
  it("signs in when the account is still in that tenant", async () => {
    const confirm = vi.fn<Confirm>(async () => true);
    const { response, sessions, userId } = await setup(confirm);
    expect(response.status).toBe(200);
    expect(sessions).toHaveLength(1);
    expect(confirm).toHaveBeenCalledWith({ userId, tenantId: "tenant-a", sessionToken: sessions[0].token });
  });

  it("gives no session and no cookie when the account moved", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { response, sessions } = await setup(async () => false);
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(sessions).toHaveLength(0);
  });

  it("fails closed when the check itself fails", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { response, sessions } = await setup(async () => { throw new Error("db down"); });
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(sessions).toHaveLength(0);
  });

  it("refuses a bound result when no check is configured", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { response } = await setup(undefined as unknown as Confirm);
    expect(response.status).toBe(403);
  });
});
