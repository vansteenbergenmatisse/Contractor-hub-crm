import CryptoJS from "crypto-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";

// Who may sign in from inside HighLevel (lead decision, 2026-11-24): HighLevel's own user list for the
// location decides, not the payload's `type` (HighLevel's notes call it unreliable).
//  (a) the list names the person with roleType "agency": the real provisionGhlUser refuses
//      (skipped_agency) -> agency_user, no session.
//  (b) a person Forge Forward already provisioned as a business user (owner) whose payload says
//      type "agency" still gets a session: they stay a business user until HighLevel removes them
//      from the location (the sync then turns the account off).
const { findEmbedCandidate, findEmbedTenant, listTenantUsers, parseEnv } = vi.hoisted(() => ({
  findEmbedCandidate: vi.fn(),
  findEmbedTenant: vi.fn(),
  listTenantUsers: vi.fn(),
  parseEnv: vi.fn(),
}));
vi.mock("@/features/embed", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/embed")>()), findEmbedCandidate, findEmbedTenant }));
vi.mock("@/features/highlevel", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/highlevel")>()), listTenantUsers }));
vi.mock("@/shared/config", () => ({ parseEnv }));
vi.mock("../../../src/features/auth/db/auth-database", async () => {
  const { memoryAdapter: memory } = await import("better-auth/adapters/memory");
  return { prismaAuthDatabase: () => memory({ user: [], session: [], account: [], verification: [], rateLimit: [] }) };
});

import { resolveEmbedSession } from "../../../src/features/auth/api/instance";
import { createAuth, createInvitedUser } from "@/features/auth";

const SECRET = "shared-secret-1";
const BASE = "https://app.example.test";
const payload = (value: object) => CryptoJS.AES.encrypt(JSON.stringify(value), SECRET).toString();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  parseEnv.mockImplementation((group: string) =>
    group === "highlevel"
      ? { GHL_APP_SHARED_SECRET: SECRET }
      : { APP_URL: BASE, BETTER_AUTH_URL: BASE, BETTER_AUTH_SECRET: Buffer.alloc(32, 7).toString("base64") },
  );
  findEmbedCandidate.mockResolvedValue(null);
  findEmbedTenant.mockResolvedValue({ tenantId: "t1", status: "connected", companyId: "co_1" });
});

function authWith(resolveUserId: (cipher: string) => Promise<never>) {
  const db = { user: [] as unknown[], session: [] as unknown[], account: [], verification: [], rateLimit: [] };
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: Buffer.alloc(32, 7).toString("base64"), baseURL: BASE,
    emailSender: { send: async () => ({ delivered: false }) },
    embedLogin: { resolveUserId, confirmSession: async () => true },
  });
  const post = () => auth.handler(new Request(`${BASE}/api/auth/embed-login`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ payload: "cipher" }),
  }));
  return { auth, db, post };
}

describe("HighLevel's user list decides, not the payload type", () => {
  it("(a) listed with roleType agency: the real provisioning refuses -> agency_user, no session", async () => {
    listTenantUsers.mockResolvedValue([{ id: "g9", email: "staff@agency.test", name: "Staff", deleted: false, roleType: "agency", role: "admin" }]);
    // The payload even claims a plain account user: the list wins.
    const cipher = payload({ email: "staff@agency.test", activeLocation: "loc_1", companyId: "co_1", type: "account", role: "admin" });
    const result = await resolveEmbedSession(cipher);
    expect(result).toEqual({ reason: "skipped_agency", who: { type: "account", role: "admin" } });

    const { db, post } = authWith(async () => result as never);
    const response = await post();
    expect(response.status).toBe(403);
    expect(response.headers.get("x-embed-denied")).toBe("agency_user");
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(db.session).toHaveLength(0);
  });

  it("(b) an existing owner whose payload says type agency still gets a session", async () => {
    const { auth, db, post } = authWith(async () => resolveEmbedSession(payload({
      email: "owner@biz.test", activeLocation: "loc_1", companyId: "co_1", type: "agency", role: "admin",
    })) as never);
    const { userId } = await createInvitedUser(auth, { email: "owner@biz.test", name: "O", password: "correct horse battery", role: "owner", tenantId: "t1" });
    findEmbedCandidate.mockResolvedValue({ userId, role: "owner", disabledAt: null, tenant: { status: "connected", companyId: "co_1", loginDisabledAt: null } });

    const response = await post();
    expect(response.status).toBe(200);
    expect(db.session).toHaveLength(1);
    expect(listTenantUsers).not.toHaveBeenCalled();
  });
});
