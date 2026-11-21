import { describe, expect, it, vi } from "vitest";
import { checkInviteEligibility, isRole, ROLES } from "@/features/auth";
import type { HighLevelUser } from "@/features/highlevel";

const user = (over: Partial<HighLevelUser> = {}): HighLevelUser => ({
  id: "hl_user_1",
  email: "pat@example.test",
  name: "Pat",
  deleted: false,
  roleType: "account",
  role: "admin",
  locationIds: ["loc_1"],
  ...over,
});

const input = { email: "pat@example.test", companyId: "comp_1", locationId: "loc_1" };

describe("roles", () => {
  it("are exactly owner, office and admin", () => {
    expect([...ROLES]).toEqual(["owner", "office", "admin"]);
  });
  it("isRole accepts those and nothing else", () => {
    expect(["owner", "office", "admin"].every(isRole)).toBe(true);
    for (const bad of ["Owner", "", "superadmin", null, undefined, 3, {}]) expect(isRole(bad)).toBe(false);
  });
});

describe("invite eligibility", () => {
  it("accepts an email that belongs to a user of that sub-account and returns the HighLevel user id", async () => {
    const searchUsers = vi.fn(async () => [user()]);
    expect(await checkInviteEligibility(input, { searchUsers })).toEqual({ eligible: true, hlUserId: "hl_user_1" });
    expect(searchUsers).toHaveBeenCalledWith({ companyId: "comp_1", locationId: "loc_1", query: "pat@example.test" });
  });

  it("matches the email ignoring case and surrounding spaces, and searches with the normalized email", async () => {
    const searchUsers = vi.fn(async () => [user({ email: "Pat@Example.TEST" })]);
    const result = await checkInviteEligibility({ ...input, email: "  PAT@example.test " }, { searchUsers });
    expect(result.eligible).toBe(true);
    expect(searchUsers).toHaveBeenCalledWith(expect.objectContaining({ query: "pat@example.test" }));
  });

  it("does not accept a partial email match (search is fuzzy, the check is exact)", async () => {
    const searchUsers = async () => [user({ email: "pat@example.test.evil.test" }), user({ id: "x", email: "xpat@example.test" })];
    expect(await checkInviteEligibility(input, { searchUsers })).toEqual({ eligible: false, reason: "not_a_user" });
  });

  it("refuses when nobody is returned", async () => {
    expect(await checkInviteEligibility(input, { searchUsers: async () => [] })).toEqual({
      eligible: false,
      reason: "not_a_user",
    });
  });

  it("refuses a deleted HighLevel user", async () => {
    expect(await checkInviteEligibility(input, { searchUsers: async () => [user({ deleted: true })] })).toEqual({
      eligible: false,
      reason: "deleted",
    });
  });

  it("refuses a user whose known locations do not include this one", async () => {
    expect(
      await checkInviteEligibility(input, { searchUsers: async () => [user({ locationIds: ["loc_other"] })] }),
    ).toEqual({ eligible: false, reason: "not_in_location" });
  });

  it("accepts a user whose locations HighLevel did not list (the search is already scoped to the location)", async () => {
    expect((await checkInviteEligibility(input, { searchUsers: async () => [user({ locationIds: [] })] })).eligible).toBe(true);
  });

  it("uses an eligible match even when another entry with the same email is deleted", async () => {
    const result = await checkInviteEligibility(input, {
      searchUsers: async () => [user({ id: "old", deleted: true }), user({ id: "live" })],
    });
    expect(result).toEqual({ eligible: true, hlUserId: "live" });
  });

  it("refuses a malformed email without calling HighLevel", async () => {
    const searchUsers = vi.fn(async () => [user()]);
    for (const email of ["", "   ", "not-an-email", "a@b", "a b@example.test", "x".repeat(300) + "@example.test"]) {
      expect(await checkInviteEligibility({ ...input, email }, { searchUsers })).toEqual({
        eligible: false,
        reason: "invalid_email",
      });
    }
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("answers lookup_failed when HighLevel fails, with no error detail", async () => {
    const result = await checkInviteEligibility(input, {
      searchUsers: async () => {
        throw new Error("token abc123 leaked");
      },
    });
    expect(result).toEqual({ eligible: false, reason: "lookup_failed" });
    expect(JSON.stringify(result)).not.toContain("abc123");
  });
});
