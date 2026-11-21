import { describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser } from "@/features/auth";

// Real Better Auth on its memory adapter: the reset request answers the same for a known and an
// unknown email, and only the known one sends mail.
const BASE = "https://app.example.test";

async function setup() {
  const sent: string[] = [];
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: Buffer.alloc(32, 7).toString("base64"),
    baseURL: BASE,
    emailSender: { send: async (m) => (sent.push(m.to), { delivered: false }) },
  });
  await createInvitedUser(auth, { email: "pat@example.test", name: "Pat", password: "correct horse battery", role: "owner", tenantId: "t1" });
  const ask = (email: string) =>
    auth.handler(new Request(`${BASE}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    }));
  return { ask, sent };
}

describe("password reset request", () => {
  it("answers the same status and body for a known and an unknown email", async () => {
    const { ask } = await setup();
    const known = await ask("pat@example.test");
    const unknown = await ask("ghost@example.test");
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("sends mail only to the known email", async () => {
    const { ask, sent } = await setup();
    await ask("ghost@example.test");
    await ask("pat@example.test");
    // Better Auth sends in the background: wait for the known mail, then check nothing else went out.
    await vi.waitFor(() => expect(sent).toContain("pat@example.test"));
    expect(sent).toEqual(["pat@example.test"]);
  });
});
