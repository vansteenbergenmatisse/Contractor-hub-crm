import { describe, expect, it } from "vitest";
import { safeHttpsUrl } from "@/shared/lib/safe-https-url";
import { safeHttpsUrl as fromLogo } from "@/shared/ui/brand-logo";
import { safeHttpsUrl as fromSettings } from "../../src/features/settings/api/live-save";

describe("safeHttpsUrl has one home", () => {
  it("keeps a clean https link and refuses the rest", () => {
    expect(safeHttpsUrl("  https://assets.example.test/a b.png ")).toBe("https://assets.example.test/a%20b.png");
    for (const bad of ["http://assets.example.test/x", "javascript:alert(1)", "not a url", "", null, undefined]) expect(safeHttpsUrl(bad)).toBeNull();
  });
  it("is the same function in the logo and in settings", () => {
    expect(fromLogo).toBe(safeHttpsUrl);
    expect(fromSettings).toBe(safeHttpsUrl);
  });
});
