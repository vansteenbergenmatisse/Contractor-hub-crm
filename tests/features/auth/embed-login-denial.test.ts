import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth } from "@/features/auth";
import { embedDenialCode, type EmbedResolution } from "../../../src/features/auth/api/embed-login";

// A refused /embed sign-in answers 403 with a small public code in a header (no email, no id), and
// writes one log line with the code, HighLevel's user type and role. Never a session.
const BASE = "https://app.example.test";
afterEach(() => vi.restoreAllMocks());

async function call(resolveUserId: () => Promise<EmbedResolution>) {
  vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const db = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: Buffer.alloc(32, 7).toString("base64"), baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) }, embedLogin: { resolveUserId },
  });
  const response = await auth.handler(new Request(`${BASE}/api/auth/embed-login`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ payload: "cipher" }),
  }));
  return { response, lines: warn.mock.calls.map((c) => String(c[0])), db };
}

describe("embedDenialCode", () => {
  it.each([
    ["not_in_location", { type: "agency", role: "admin" }, "agency_user"],
    ["not_in_location", { type: "Agency" }, "agency_user"],
    ["not_in_location", { type: "account", role: "user" }, "not_in_location"],
    ["not_in_location", undefined, "not_in_location"],
    ["skipped_agency", undefined, "agency_user"],
    ["skipped_removed", undefined, "not_in_location"],
    ["tenant_login_off", undefined, "login_off"],
    ["skipped_login_off", undefined, "login_off"],
    ["location_not_installed", undefined, "not_connected"],
    ["tenant_uninstalled", undefined, "not_connected"],
    ["tenant_needs_reconnect", undefined, "not_connected"],
    ["user_disabled", undefined, "user_off"],
    ["skipped_conflict", undefined, "account_conflict"],
    ["decrypt_failed", undefined, "other"],
    ["provision_failed", undefined, "other"],
    ["no_match", undefined, "other"],
    ["origin", undefined, "other"],
    ["role_not_allowed", undefined, "other"],
    ["role_not_allowed", { type: "agency" }, "other"],
    ["company_mismatch", undefined, "other"],
    ["company_mismatch", { type: "agency" }, "other"],
    ["lookup_failed", undefined, "other"],
  ] as const)("%s (%o) -> %s", (reason, who, code) => {
    expect(embedDenialCode(reason, who)).toBe(code);
  });
});

describe("embed-login refusal", () => {
  it("an agency user gets agency_user in the header, the fixed body and no session", async () => {
    const { response, lines, db } = await call(async () => ({ reason: "not_in_location", who: { type: "agency", role: "admin" } }));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-embed-denied")).toBe("agency_user");
    expect(await response.json()).toEqual({ message: "Forbidden" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(db.session).toHaveLength(0);
    expect(lines).toEqual(["embed_login denied reason=agency_user type=agency role=admin"]);
  });

  it("a location user who is not on the list gets not_in_location", async () => {
    const { response, lines } = await call(async () => ({ reason: "not_in_location", who: { type: "account", role: "user" } }));
    expect(response.headers.get("x-embed-denied")).toBe("not_in_location");
    expect(lines).toEqual(["embed_login denied reason=not_in_location type=account role=user"]);
  });

  it("logs none for a missing type or role and never anything that looks like an email or an odd value", async () => {
    const { lines } = await call(async () => ({ reason: "tenant_login_off", who: { type: "pat@x.test", role: "admin user\nfake=1" } }));
    expect(lines).toEqual(["embed_login denied reason=login_off type=other role=other"]);
    vi.restoreAllMocks();
    const plain = await call(async () => null);
    expect(plain.lines).toEqual(["embed_login denied reason=other type=none role=none"]);
    expect(plain.response.headers.get("x-embed-denied")).toBe("other");
  });
});
