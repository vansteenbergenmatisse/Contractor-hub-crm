import CryptoJS from "crypto-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveEmbedLogin: decrypt, find the user, or (installed location, no account yet) confirm with
// HighLevel that the person belongs to it and create the account on the spot. Database and HighLevel
// are mocked; the decrypt and the decision rules are real.
const findEmbedCandidate = vi.fn();
const findEmbedTenant = vi.fn();
const listTenantUsers = vi.fn();
const parseEnv = vi.fn();
const provisionGhlUser = vi.fn();
vi.mock("@/features/embed", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/embed")>()), findEmbedCandidate, findEmbedTenant }));
vi.mock("@/features/highlevel", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/highlevel")>()), listTenantUsers }));
vi.mock("@/shared/config", () => ({ parseEnv }));
vi.mock("../../../src/features/auth/db/auth-database", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { prismaAuthDatabase: () => memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }) };
});
vi.mock("../../../src/features/auth/api/provision", () => ({ provisionGhlUser, deactivateGhlUser: vi.fn(), mapGhlRole: vi.fn() }));

const SECRET = "shared-secret-1";
const payload = (value: object) => CryptoJS.AES.encrypt(JSON.stringify(value), SECRET).toString();
const ghlUser = { id: "g1", email: "Pat@X.test", name: "Pat Lee", deleted: false, roleType: "account", role: "admin", locationIds: ["loc_1"] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  parseEnv.mockImplementation((group: string) => (group === "highlevel" ? { GHL_APP_SHARED_SECRET: SECRET } : { APP_URL: "https://app.example.test", BETTER_AUTH_URL: "https://app.example.test", BETTER_AUTH_SECRET: "x".repeat(32) }));
  findEmbedCandidate.mockResolvedValue(null);
  findEmbedTenant.mockResolvedValue({ tenantId: "t1", status: "connected", companyId: "co_1" });
  listTenantUsers.mockResolvedValue([ghlUser]);
  provisionGhlUser.mockResolvedValue({ outcome: "created", userId: "new-user" });
});

const call = async (value: object) => (await import("../../../src/features/auth/api/instance")).resolveEmbedLogin(payload(value));
const good = { email: "Pat@X.test", activeLocation: "loc_1", companyId: "co_1" };

describe("resolveEmbedLogin", () => {
  it("creates the user on the spot when the location is installed and HighLevel lists the person", async () => {
    expect(await call(good)).toBe("new-user");
    expect(listTenantUsers).toHaveBeenCalledWith("t1");
    expect(provisionGhlUser).toHaveBeenCalledWith(expect.anything(), { tenantId: "t1", ghlUserId: "g1", email: "pat@x.test", name: "Pat Lee", ghlRole: "admin", ghlRoleType: "account", moveProof: { kind: "embed", readSourceEmails: expect.any(Function) } });
  });

  it("signs in an existing user without calling HighLevel or provisioning", async () => {
    findEmbedCandidate.mockResolvedValue({ userId: "u1", role: "owner", disabledAt: null, tenant: { status: "connected", companyId: "co_1" } });
    expect(await call(good)).toBe("u1");
    expect(listTenantUsers).not.toHaveBeenCalled();
    expect(provisionGhlUser).not.toHaveBeenCalled();
  });

  it("denies with location_not_installed and creates nothing when the app is not installed there", async () => {
    findEmbedTenant.mockResolvedValue(null);
    expect(await call(good)).toEqual({ reason: "location_not_installed" });
    expect(listTenantUsers).not.toHaveBeenCalled();
    expect(provisionGhlUser).not.toHaveBeenCalled();
  });

  it("denies with not_in_location when HighLevel does not list the person (or lists them as deleted)", async () => {
    listTenantUsers.mockResolvedValue([{ ...ghlUser, email: "other@x.test" }]);
    expect(await call(good)).toEqual({ reason: "not_in_location" });
    listTenantUsers.mockResolvedValue([{ ...ghlUser, deleted: true }]);
    expect(await call(good)).toEqual({ reason: "not_in_location" });
    expect(provisionGhlUser).not.toHaveBeenCalled();
  });

  it("returns the skip reason for an agency user instead of a user id", async () => {
    provisionGhlUser.mockResolvedValue({ outcome: "skipped_agency", userId: null });
    expect(await call(good)).toEqual({ reason: "skipped_agency" });
  });

  it("denies with provision_failed when HighLevel or the database fails, and logs no email", async () => {
    listTenantUsers.mockRejectedValue(new Error("hl down for pat@x.test"));
    expect(await call(good)).toEqual({ reason: "provision_failed" });
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toContain("pat@x.test");
  });

  it("denies with decrypt_failed for a payload made with another secret", async () => {
    const { resolveEmbedLogin } = await import("../../../src/features/auth/api/instance");
    expect(await resolveEmbedLogin(CryptoJS.AES.encrypt(JSON.stringify(good), "another").toString())).toEqual({ reason: "decrypt_failed" });
  });

  it("logs the decrypt result and the field names, never a value", async () => {
    await call(good);
    const info = JSON.stringify((console.info as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(info).toContain('\\"step\\":\\"decrypt\\"');
    expect(info).toContain("activeLocation,companyId,email");
    for (const value of ["pat@x.test", "loc_1", "co_1"]) expect(info.toLowerCase()).not.toContain(value);
  });
});
