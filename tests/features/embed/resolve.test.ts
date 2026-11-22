import { describe, expect, it, vi } from "vitest";
import { resolveEmbedUser, type EmbedCandidate, type UserContext } from "@/features/embed";

const context: UserContext = { email: "pat@example.test", activeLocation: "loc_1", companyId: "co_1" };
const candidate: EmbedCandidate = {
  userId: "u1",
  role: "owner",
  disabledAt: null,
  tenant: { status: "connected", companyId: "co_1" },
};
const resolve = (found: EmbedCandidate | null, ctx = context) =>
  resolveEmbedUser(ctx, { findCandidate: vi.fn(async () => found) });

describe("resolveEmbedUser", () => {
  it("returns the user id for an owner of the connected tenant", async () => {
    expect(await resolve(candidate)).toBe("u1");
  });

  it("accepts an office user", async () => {
    expect(await resolve({ ...candidate, role: "office" })).toBe("u1");
  });

  it("asks the database for exactly the email and the location of the payload", async () => {
    const findCandidate = vi.fn(async () => candidate);
    await resolveEmbedUser(context, { findCandidate });
    expect(findCandidate).toHaveBeenCalledWith({ email: "pat@example.test", locationId: "loc_1" });
  });

  it.each([
    ["no match", null],
    ["an admin", { ...candidate, role: "admin" as const }],
    ["a disabled user", { ...candidate, disabledAt: new Date() }],
    ["a tenant that needs reconnect", { ...candidate, tenant: { status: "needs_reconnect" as const, companyId: "co_1" } }],
    ["an uninstalled tenant", { ...candidate, tenant: { status: "uninstalled" as const, companyId: "co_1" } }],
    ["a different company", { ...candidate, tenant: { status: "connected" as const, companyId: "co_2" } }],
  ])("gives null for %s", async (_name, found) => {
    expect(await resolve(found)).toBeNull();
  });

  it("does not compare companies when the payload has none, or the tenant has none", async () => {
    expect(await resolve(candidate, { email: context.email, activeLocation: "loc_1" })).toBe("u1");
    expect(await resolve({ ...candidate, tenant: { status: "connected", companyId: null } })).toBe("u1");
  });

  it("gives null when the lookup throws (fails closed)", async () => {
    const result = await resolveEmbedUser(context, {
      findCandidate: async () => {
        throw new Error("db down");
      },
    });
    expect(result).toBeNull();
  });
});
