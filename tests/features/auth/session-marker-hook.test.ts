import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser } from "@/features/auth";
import { judgeUnused, type AccountSnapshot } from "../../../src/features/auth/api/account-move";

const BASE = "https://app.example.test";
const PASSWORD = "correct horse battery";

async function setup(clearUnusedMarker: (userId: string) => Promise<void>) {
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
    clearUnusedMarker,
  });
  const { userId } = await createInvitedUser(auth, { email: "o@example.test", name: "O", password: PASSWORD, role: "owner", tenantId: "A" });
  return { auth, userId };
}
const signIn = (auth: ReturnType<typeof createAuth>) => auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email: "o@example.test", password: PASSWORD }),
}));

afterEach(() => vi.restoreAllMocks());

describe("the session-create hook and the unused marker", () => {
  it("clears the marker before the session exists", async () => {
    let sessionsAtClear = -1;
    const holder: { auth?: ReturnType<typeof createAuth> } = {};
    const clear = vi.fn(async (userId: string) => {
      sessionsAtClear = (await (await holder.auth!.$context).internalAdapter.listSessions(userId, undefined)).length;
    });
    const built = await setup(clear);
    holder.auth = built.auth;
    expect((await signIn(built.auth)).status).toBe(200);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(built.userId);
    expect(sessionsAtClear).toBe(0);
  });

  it("still signs in when clearing fails, and logs a code without personal data", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { auth, userId } = await setup(async () => { throw Object.assign(new Error("o@example.test"), { code: "P2021" }); });
    expect((await signIn(auth)).status).toBe(200);
    expect(await (await auth.$context).internalAdapter.listSessions(userId, undefined)).toHaveLength(1);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("P2021");
    expect(logged).not.toContain("o@example.test");
    expect(logged).not.toContain(userId);
  });

  it("does not clear for a user who gets no session", async () => {
    const clear = vi.fn(async () => {});
    const { auth, userId } = await setup(clear);
    await (await auth.$context).internalAdapter.updateUser(userId, { disabledAt: new Date() } as never);
    expect((await signIn(auth)).status).not.toBe(200);
    expect(clear).not.toHaveBeenCalled();
  });

  it("a stale marker beside a session or a changed password counts as used", () => {
    const stale: AccountSnapshot = {
      role: "office", tenantId: "A", disabledAt: null, linkDeletedAt: null,
      marker: { tenantId: "A", credentialFingerprint: "fp" },
      credentials: [{ providerId: "credential", passwordFingerprint: "fp" }],
      sessionCount: 1,
    };
    expect(judgeUnused(stale, "A")).toBe("used");
    expect(judgeUnused({ ...stale, sessionCount: 0, credentials: [{ providerId: "credential", passwordFingerprint: "other" }] }, "A")).toBe("used");
  });
});
