import { describe, expect, it } from "vitest";
import { buildBrand, contrastRatio } from "@/features/brand";

const v = (key: string, value: string) => ({ key, value });

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for equal colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });
  it("accepts 3-digit hex", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
  });
});

describe("buildBrand: colors", () => {
  it("maps each key to the CSS variable with dashes", () => {
    const b = buildBrand([v("main_color", "#123456"), v("main_hover_color", "#654321")]);
    expect(b.cssVars["--main-color"]).toBe("#123456");
    expect(b.cssVars["--main-hover-color"]).toBe("#654321");
  });

  it("text_color also sets --normal-text-color", () => {
    const b = buildBrand([v("text_color", "#222222")]);
    expect(b.cssVars["--text-color"]).toBe("#222222");
    expect(b.cssVars["--normal-text-color"]).toBe("#222222");
  });

  it("ignores keys that are not one of the 14 colors (including font keys)", () => {
    const b = buildBrand([v("heading_font", "Arial"), v("business_name", "Acme"), v("evil", "#ffffff")]);
    expect(b.cssVars).toEqual({});
  });

  it("rejects a value that is not a hex color and reports the key; the variable stays unset", () => {
    const b = buildBrand([v("main_color", "red; } body{display:none"), v("sub_color", "url(javascript:1)")]);
    expect(b.cssVars).toEqual({});
    expect(b.rejected).toEqual(expect.arrayContaining(["main_color", "sub_color"]));
  });

  it.each(["#1", "#12", "#1234", "#12345", "#1234567", "#12345678", "#ggg", "#fff;", "#fff}", "#fff;x:y", "fff", "#", "##fff", "#ffff ff"])(
    "refuses %s (only 3 or 6 hex digits are a color)",
    (bad) => {
      const b = buildBrand([v("sub_color", bad)]);
      expect(b.cssVars).toEqual({});
      expect(b.rejected).toEqual(["sub_color"]);
    },
  );

  it("takes the first value when a key appears twice", () => {
    expect(buildBrand([v("sub_color", "#111111"), v("sub_color", "#222222")]).cssVars["--sub-color"]).toBe("#111111");
  });

  it("does not set --normal-text-color when text_color is refused", () => {
    expect(buildBrand([v("text_color", "nope")]).cssVars).toEqual({});
  });

  it("trims whitespace and lower-cases a valid hex", () => {
    expect(buildBrand([v("main_color", "  #ABCDEF ")]).cssVars["--main-color"]).toBe("#abcdef");
  });
});

describe("buildBrand: contrast rule (main_color vs text_on_main_color >= 4.5)", () => {
  it("keeps both when the ratio is 4.5 or more", () => {
    const b = buildBrand([v("main_color", "#000000"), v("text_on_main_color", "#ffffff")]);
    expect(b.cssVars["--main-color"]).toBe("#000000");
    expect(b.cssVars["--text-on-main-color"]).toBe("#ffffff");
    expect(b.rejected).toEqual([]);
  });

  it("drops main_color and says which key is wrong when the ratio is under 4.5", () => {
    const b = buildBrand([v("main_color", "#777777"), v("text_on_main_color", "#888888")]);
    expect(b.cssVars["--main-color"]).toBeUndefined();
    expect(b.rejected).toContain("main_color");
  });

  it("accepts a ratio just over 4.5 and refuses one just under it (4.54 vs 4.48 on white)", () => {
    const over = buildBrand([v("main_color", "#767676"), v("text_on_main_color", "#ffffff")]);
    expect(over.cssVars["--main-color"]).toBe("#767676");
    const under = buildBrand([v("main_color", "#777777"), v("text_on_main_color", "#ffffff")]);
    expect(under.cssVars["--main-color"]).toBeUndefined();
    expect(under.rejected).toEqual(["main_color"]);
  });

  it("does not check the rule when one of the two is missing", () => {
    const b = buildBrand([v("main_color", "#777777")]);
    expect(b.cssVars["--main-color"]).toBe("#777777");
    expect(b.rejected).toEqual([]);
  });
});

describe("buildBrand: images and text", () => {
  it("accepts https logo, favicon and image background", () => {
    const b = buildBrand([
      v("business_logo", "https://img.example.test/logo.png"),
      v("business_favicon_url", "https://img.example.test/f.ico"),
      v("business_main_background_video_or_image", "https://img.example.test/bg.jpg?x=1"),
    ]);
    expect(b.logoUrl).toBe("https://img.example.test/logo.png");
    expect(b.faviconUrl).toBe("https://img.example.test/f.ico");
    expect(b.backgroundImageUrl).toBe("https://img.example.test/bg.jpg?x=1");
  });

  it("refuses http, javascript:, data: and unparsable links", () => {
    for (const bad of ["http://x.test/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "not a url", ""]) {
      const b = buildBrand([v("business_logo", bad), v("business_favicon_url", bad)]);
      expect(b.logoUrl).toBeNull();
      expect(b.faviconUrl).toBeNull();
    }
  });

  it("does not use a video as the sign-in background (mp4, webm, mov)", () => {
    for (const ext of ["mp4", "webm", "mov", "MP4"]) {
      const b = buildBrand([v("business_main_background_video_or_image", `https://x.test/bg.${ext}?v=2`)]);
      expect(b.backgroundImageUrl).toBeNull();
    }
  });

  it("passes business and owner names through, empty becomes null", () => {
    expect(buildBrand([v("business_name", " Acme "), v("business_owner_name", "")]).businessName).toBe("Acme");
    expect(buildBrand([v("business_owner_name", "")]).ownerName).toBeNull();
  });

  it("returns defaults for no values", () => {
    expect(buildBrand([])).toEqual({
      cssVars: {},
      logoUrl: null,
      faviconUrl: null,
      backgroundImageUrl: null,
      businessName: null,
      ownerName: null,
      rejected: [],
    });
  });
});
