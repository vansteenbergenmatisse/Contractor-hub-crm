import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/features/brand";
import {
  COLOR_KEYS, ESSENTIAL_KEYS, MOCK_CUSTOM_VALUES, contrast, filterSettings, initialState, settingsReducer, validateValues,
} from "@/features/settings";

// The sample values hold no business identity, so a valid set needs a made-up name.
const base = () => ({ ...MOCK_CUSTOM_VALUES, business_name: "Test Roofing Co" });

describe("key names", () => {
  it("are exactly the 17 + 14 keys of the build prompt and the mock covers each", () => {
    expect(ESSENTIAL_KEYS).toEqual([
      "business_name", "business_owner_name", "business_phone_number", "business_email", "business_address",
      "business_hours", "business_main_city", "business_main_county", "business_main_state_abbreviation",
      "business_main_keyword", "business_website_url", "universal_cta", "business_logo", "business_favicon_url",
      "business_main_background_video_or_image", "referral_reward_text", "seasonal_offer_text",
    ]);
    expect(COLOR_KEYS).toEqual([
      "main_color", "main_hover_color", "main_light_color", "main_background_color", "main_border_color",
      "sub_color", "highlight_color", "error_color", "background_color", "section_background_color",
      "border_color", "text_color", "light_text_color", "text_on_main_color",
    ]);
    expect(Object.keys(MOCK_CUSTOM_VALUES).sort()).toEqual([...ESSENTIAL_KEYS, ...COLOR_KEYS].sort());
  });

  it("never change on save, only values", () => {
    const s = settingsReducer(initialState(), { type: "edit", key: "business_name", value: "  New Name  " });
    const saved = settingsReducer(s, { type: "save" });
    expect(Object.keys(saved.values).sort()).toEqual(Object.keys(MOCK_CUSTOM_VALUES).sort());
    expect(saved.values.business_name).toBe("New Name");
  });
});

describe("validateValues", () => {
  it("accepts the mock values", () => {
    expect(validateValues(base())).toBeNull();
  });

  it("refuses every color key that is not a 6 digit hex and names the key", () => {
    for (const key of COLOR_KEYS) {
      const p = validateValues({ ...base(), [key]: "green" });
      expect(p?.key).toBe(key);
      expect(p?.message).toContain(`custom_values.${key}`);
      expect(p?.section).toBe("colors");
    }
    expect(validateValues({ ...base(), sub_color: "#abc" })?.key).toBe("sub_color");
    expect(validateValues({ ...base(), sub_color: "" })?.key).toBe("sub_color");
  });

  it("requires the business name", () => {
    const p = validateValues({ ...base(), business_name: "   " });
    expect(p).toMatchObject({ key: "business_name", section: "biz" });
  });

  it("accepts empty or https links and refuses others, naming the key", () => {
    expect(validateValues({ ...base(), business_logo: "https://example.com/logo.png" })).toBeNull();
    for (const key of ["business_logo", "business_favicon_url", "business_main_background_video_or_image"]) {
      const p = validateValues({ ...base(), [key]: "http://example.com/a.png" });
      expect(p?.key).toBe(key);
      expect(p?.message).toContain(`custom_values.${key}`);
    }
  });

  it("refuses a main color under 4.5 to 1 against the text on it and names main_color (boundary)", () => {
    // #767676 on white is 4.54 to 1; #777777 on white is 4.48 to 1.
    expect(validateValues({ ...base(), main_color: "#767676", text_on_main_color: "#FFFFFF" })).toBeNull();
    const p = validateValues({ ...base(), main_color: "#777777", text_on_main_color: "#FFFFFF" });
    expect(p?.key).toBe("main_color");
    expect(p?.message).toContain("custom_values.main_color");
    expect(p?.section).toBe("colors");
  });

  it("checks the color format before the contrast", () => {
    const p = validateValues({ ...base(), text_on_main_color: "white" });
    expect(p?.key).toBe("text_on_main_color");
  });
});

describe("bad value on save", () => {
  it("opens the section that holds it and asks to focus its field", () => {
    let s = initialState(base());
    s = settingsReducer(s, { type: "go", section: "conn" });
    s = settingsReducer(s, { type: "edit", key: "main_color", value: "#777777" });
    s = settingsReducer(s, { type: "edit", key: "text_on_main_color", value: "#FFFFFF" });
    s = settingsReducer(s, { type: "save" });
    expect(s.ok).toBe(false);
    expect(s.err?.key).toBe("main_color");
    expect(s.sec).toBe("colors");
    expect(s.open).toBe(true);
    expect(s.cols).toBe(true);
    expect(s.focus?.key).toBe("main_color");
    expect(s.values.main_color).toBe(MOCK_CUSTOM_VALUES.main_color);
  });

  it("opens Business details for a bad business value and re-opens collapsed colors for a color", () => {
    let s = settingsReducer(initialState(base()), { type: "go", section: "colors" });
    s = settingsReducer(s, { type: "toggleCols" });
    s = settingsReducer(s, { type: "edit", key: "business_name", value: "" });
    s = settingsReducer(s, { type: "save" });
    expect(s.sec).toBe("biz");
    expect(s.focus?.key).toBe("business_name");
    s = settingsReducer(s, { type: "edit", key: "business_name", value: "Ok" });
    s = settingsReducer(s, { type: "edit", key: "border_color", value: "nope" });
    s = settingsReducer(s, { type: "save" });
    expect(s.sec).toBe("colors");
    expect(s.cols).toBe(true);
  });

  it("a good save stores the values and clears the error", () => {
    let s = settingsReducer(initialState(base()), { type: "edit", key: "main_color", value: "#1B5E20" });
    s = settingsReducer(s, { type: "save" });
    expect(s.ok).toBe(true);
    expect(s.err).toBeNull();
    expect(s.values.main_color).toBe("#1B5E20");
  });
});

describe("settings search", () => {
  it("shows everything when empty", () => {
    const f = filterSettings("  ");
    expect(f.active).toBe(false);
    expect(f.any).toBe(true);
    expect(Object.values(f.items).every(Boolean)).toBe(true);
  });

  it("hides fields and rows that do not match", () => {
    const f = filterSettings("phone");
    expect(f.items["cv-business_phone_number"]).toBe(true);
    expect(f.items["cv-business_email"]).toBe(false);
    expect(f.items["conn-0"]).toBe(true);
    expect(f.items["conn-2"]).toBe(false);
    expect(f.sections.biz).toBe(true);
    expect(f.sections.choice).toBe(false);
  });

  it("matches the key text too, case-insensitively", () => {
    const f = filterSettings("TEXT_ON_MAIN");
    expect(f.items["cv-text_on_main_color"]).toBe(true);
    expect(f.items["cv-main_color"]).toBe(false);
  });

  it("keeps all rows of a section whose title matches", () => {
    const f = filterSettings("connections");
    expect(f.sections.conn).toBe(true);
    for (let i = 0; i < 6; i++) expect(f.items[`conn-${i}`]).toBe(true);
    expect(f.sections.biz).toBe(false);
  });

  it("reports no match", () => {
    const f = filterSettings("zzzz-nothing");
    expect(f.any).toBe(false);
    expect(Object.values(f.sections).some(Boolean)).toBe(false);
  });
});

describe("two real switches", () => {
  it("toggle at once and independently", () => {
    let s = initialState(base());
    const before = [...s.sw];
    s = settingsReducer(s, { type: "switch", index: 0 });
    expect(s.sw[0]).toBe(!before[0]);
    expect(s.sw[1]).toBe(before[1]);
    s = settingsReducer(s, { type: "switch", index: 0 });
    expect(s.sw[0]).toBe(before[0]);
  });
});

describe("section navigation", () => {
  it("opens a section, goes back, and searching clears nothing but shows all", () => {
    let s = initialState(base());
    expect(s.open).toBe(false);
    s = settingsReducer(s, { type: "go", section: "choice" });
    expect(s).toMatchObject({ sec: "choice", open: true });
    s = settingsReducer(s, { type: "back" });
    expect(s.open).toBe(false);
    expect(s.sec).toBe("choice");
    s = settingsReducer(s, { type: "search", q: "name" });
    expect(s.q).toBe("name");
  });

  it("how it works and ask-to-connect only change local state", () => {
    let s = settingsReducer(initialState(), { type: "how", index: 1 });
    expect(s.how[1]).toBe(true);
    s = settingsReducer(s, { type: "how", index: 1 });
    expect(s.how[1]).toBe(false);
    s = settingsReducer(s, { type: "ask", index: 4 });
    expect(s.asked[4]).toBe(true);
  });
});

describe("contrast", () => {
  it("matches the brand feature's contrastRatio", () => {
    for (const [a, b] of [["#2E7D32", "#FFFFFF"], ["#777777", "#FFFFFF"], ["#0F2740", "#F5A524"], ["#000000", "#ffffff"]]) {
      expect(contrast(a, b)).toBeCloseTo(contrastRatio(a, b), 10);
    }
  });
});
