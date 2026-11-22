import { describe, expect, it } from "vitest";
import { buildBusiness } from "@/features/app-shell";

describe("buildBusiness", () => {
  it("builds initials, first name and the tag line", () => {
    expect(buildBusiness({ name: "Northway Roofing", owner: "Mike Dalton", keyword: "Roofing", city: "Columbus", state: "OH" })).toEqual({
      name: "Northway Roofing", init: "NR", tag: "Roofing · Columbus, OH", owner: "Mike Dalton", ownerInit: "MD", first: "Mike",
    });
  });

  it("falls back to plain words for empty or blank values and never throws", () => {
    const b = buildBusiness({ name: "  ", owner: null });
    expect(b.name).toBe("Your business");
    expect(b.owner).toBe("Owner");
    expect(b.first).toBe("Owner");
    expect(b.tag).toBe("");
  });

  it("copes with a one word name and a missing state", () => {
    expect(buildBusiness({ name: "Acme", keyword: "Lawn", city: "Dayton" })).toMatchObject({ init: "A", tag: "Lawn · Dayton" });
  });
});
