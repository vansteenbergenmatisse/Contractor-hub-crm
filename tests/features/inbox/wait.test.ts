import { describe, expect, it } from "vitest";
import { waitLabel, waitLevelClass, waitText, waitTier } from "../../../src/features/inbox/api/wait";
import { waitLabel as publicWaitLabel, waitTier as publicWaitTier } from "@/features/inbox";

describe("wait tiers", () => {
  it.each([
    [0, "warn"], [14, "warn"], [59, "warn"],
    [60, "bad"], [61, "bad"], [1439, "bad"],
    [1440, "hot"], [2880, "hot"],
  ] as const)("%i minutes is %s", (minutes, tier) => {
    expect(waitTier(minutes)).toBe(tier);
    expect(waitLevelClass(minutes)).toBe(`is-${tier}`);
    expect(publicWaitTier(minutes)).toBe(tier);
  });
});

describe("wait words", () => {
  it.each([
    [14, "14 min"], [59, "59 min"], [60, "1 hr"], [119, "1 hr"], [120, "2 hrs"], [1439, "23 hrs"],
    [1440, "1 day"], [2879, "1 day"], [2880, "2 days"], [10080, "7 days"],
  ])("%i minutes reads %s", (minutes, text) => {
    expect(waitText(minutes)).toBe(text);
  });
  it("builds the label from minutes", () => {
    expect(waitLabel(14)).toBe("Waiting 14 min");
    expect(publicWaitLabel(2880)).toBe("Waiting 2 days");
  });
});
