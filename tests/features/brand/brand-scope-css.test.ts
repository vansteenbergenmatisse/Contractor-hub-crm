import { describe, expect, it } from "vitest";
import { brandScopeCss, EMPTY_BRAND } from "@/features/brand";
import type { Brand } from "@/features/brand";

const withVars = (cssVars: Record<string, string>): Brand => ({ ...EMPTY_BRAND, cssVars });

describe("brandScopeCss", () => {
  it("prints the tenant's colors for <html> and for every .brand-scope, above the design defaults", () => {
    const css = brandScopeCss(withVars({ "--main-color": "#1565c0", "--background-color": "#fafafa" }));
    expect(css).toBe(
      ":root:root:root,.brand-scope.brand-scope.brand-scope{--main-color:#1565c0;--background-color:#fafafa}",
    );
  });

  it("is empty when the tenant has no colors (the design defaults stay)", () => {
    expect(brandScopeCss(withVars({}))).toBe("");
  });

  it("drops anything that is not a plain variable name with a hex color, so nothing can break out of the rule", () => {
    const css = brandScopeCss(
      withVars({
        "--main-color": "red}body{display:none",
        "--x;}": "#ffffff",
        "--ok-color": "#abc",
        "--text-color": "</style><script>",
      }),
    );
    expect(css).toBe(":root:root:root,.brand-scope.brand-scope.brand-scope{--ok-color:#abc}");
  });
});
