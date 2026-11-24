import CryptoJS from "crypto-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The embed resolver hands HighLevel's user type and role (no email, no ids) along with a refusal, so
// an agency login is told apart from a user who is not on this business's list. Nothing is created.
const { findEmbedCandidate, findEmbedTenant, listTenantUsers, parseEnv, provisionGhlUser } = vi.hoisted(() => ({
  findEmbedCandidate: vi.fn(),
  findEmbedTenant: vi.fn(),
  listTenantUsers: vi.fn(),
  parseEnv: vi.fn(),
  provisionGhlUser: vi.fn(),
}));
vi.mock("@/features/embed", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/embed")>()), findEmbedCandidate, findEmbedTenant }));
vi.mock("@/features/highlevel", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/highlevel")>()), listTenantUsers }));
vi.mock("@/shared/config", () => ({ parseEnv }));
vi.mock("../../../src/features/auth/db/auth-database", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { prismaAuthDatabase: () => memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }) };
});
vi.mock("../../../src/features/auth/api/provision", () => ({ provisionGhlUser, deactivateGhlUser: vi.fn(), mapGhlRole: vi.fn() }));

import { resolveEmbedSession } from "../../../src/features/auth/api/instance";
import { embedDenialCode } from "../../../src/features/auth/api/embed-login";

const SECRET = "shared-secret-1";
const payload = (value: object) => CryptoJS.AES.encrypt(JSON.stringify(value), SECRET).toString();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  parseEnv.mockImplementation(() => ({ GHL_APP_SHARED_SECRET: SECRET }));
  findEmbedCandidate.mockResolvedValue(null);
  findEmbedTenant.mockResolvedValue({ tenantId: "t1", status: "connected", companyId: "co_1" });
  listTenantUsers.mockResolvedValue([{ id: "g1", email: "owner@x.test", name: "Owner", deleted: false, roleType: "account", role: "admin" }]);
});

describe("resolveEmbedSession", () => {
  it("an agency login that is not on the sub-account's list: not_in_location with type agency -> agency_user", async () => {
    const result = await resolveEmbedSession(payload({ email: "agency@x.test", activeLocation: "loc_1", companyId: "co_1", type: "agency", role: "admin" }));
    expect(result).toEqual({ reason: "not_in_location", who: { type: "agency", role: "admin" } });
    expect(embedDenialCode("not_in_location", (result as { who?: { type?: string } }).who)).toBe("agency_user");
    expect(provisionGhlUser).not.toHaveBeenCalled();
  });

  it("a location user who is not on the list: not_in_location", async () => {
    const result = await resolveEmbedSession(payload({ email: "new@x.test", activeLocation: "loc_1", type: "account", role: "user" }));
    expect(result).toEqual({ reason: "not_in_location", who: { type: "account", role: "user" } });
    expect(embedDenialCode("not_in_location", (result as { who?: { type?: string } }).who)).toBe("not_in_location");
  });

  it("an access denial also carries type and role", async () => {
    findEmbedTenant.mockResolvedValue({ tenantId: "t1", status: "connected", companyId: "co_1", loginDisabledAt: new Date() });
    const result = await resolveEmbedSession(payload({ email: "owner@x.test", activeLocation: "loc_1", type: "account", role: "admin" }));
    expect(result).toEqual({ reason: "tenant_login_off", who: { type: "account", role: "admin" } });
  });
});
