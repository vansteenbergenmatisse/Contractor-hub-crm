import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth } from "@/features/auth";

// The resolver may say why nobody signs in. The reason goes to the audit line only; the browser
// always gets the same fixed 403.
const BASE = "https://app.example.test";
afterEach(() => vi.restoreAllMocks());

async function call(resolveUserId: (p: string) => Promise<string | null | { reason: string }>) {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: Buffer.alloc(32, 7).toString("base64"), baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) }, embedLogin: { resolveUserId },
  });
  const response = await auth.handler(new Request(`${BASE}/api/auth/embed-login`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ payload: "cipher" }),
  }));
  return { response, audit: info.mock.calls.map((c) => String(c[0])).join("\n") };
}

describe("embed-login reasons", () => {
  it("logs the reason code and answers the fixed 403 with no cookie", async () => {
    const { response, audit } = await call(async () => ({ reason: "location_not_installed" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Forbidden" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(audit).toContain("location_not_installed");
  });

  it("keeps no_match for a plain null", async () => {
    const { audit } = await call(async () => null);
    expect(audit).toContain("no_match");
  });

  it("treats a throwing resolver as no_match", async () => {
    const { response, audit } = await call(async () => { throw new Error("boom"); });
    expect(response.status).toBe(403);
    expect(audit).toContain("no_match");
  });
});
