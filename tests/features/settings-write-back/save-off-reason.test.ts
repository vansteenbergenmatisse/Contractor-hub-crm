import { describe, expect, it } from "vitest";
import { SAVE_OFF_FOR_OFFICE, SAVE_OFF_FOR_OWNER, SAVE_OFF_NOT_CONNECTED, SAVE_OFF_NOT_OWNER, saveOffReason } from "@/features/settings-write-back";

// The reason must be true for the person reading it.
describe("saveOffReason", () => {
  it("tells a connected owner to ask Forge Forward", () => {
    expect(saveOffReason("owner", true)).toBe(SAVE_OFF_FOR_OWNER);
  });

  it("tells an office user only the owner can change the details", () => {
    expect(saveOffReason("office", true)).toBe(SAVE_OFF_FOR_OFFICE);
  });

  it("says the business is not connected when there is no tenant", () => {
    expect(saveOffReason("owner", false)).toBe(SAVE_OFF_NOT_CONNECTED);
    expect(saveOffReason("office", false)).toBe(SAVE_OFF_NOT_CONNECTED);
    expect(saveOffReason(undefined, false)).toBe(SAVE_OFF_NOT_CONNECTED);
    expect(SAVE_OFF_NOT_CONNECTED).toMatch(/not connected/i);
  });

  it("does not give the owner text to an admin or a user with no role", () => {
    expect(saveOffReason("admin", true)).toBe(SAVE_OFF_NOT_OWNER);
    expect(saveOffReason(undefined, true)).toBe(SAVE_OFF_NOT_OWNER);
    expect(SAVE_OFF_NOT_OWNER).not.toBe(SAVE_OFF_FOR_OWNER);
  });
});
