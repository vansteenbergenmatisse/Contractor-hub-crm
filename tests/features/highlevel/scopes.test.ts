import { describe, expect, it } from "vitest";
import { OAUTH_SCOPES, resolveScopes } from "@/features/highlevel";

describe("resolveScopes", () => {
  it("returns the default list when nothing is configured", () => {
    for (const value of [undefined, "", "   "]) expect(resolveScopes(value)).toEqual([...OAUTH_SCOPES]);
  });

  it("splits on spaces, commas and newlines and drops duplicates", () => {
    expect(resolveScopes("a.read, b.write\nc/d.read  a.read")).toEqual(["a.read", "b.write", "c/d.read"]);
  });

  it("refuses an entry that does not look like a scope", () => {
    expect(() => resolveScopes("a.read b write&x=1")).toThrow(/scope/i);
  });
});
