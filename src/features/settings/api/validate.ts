import type { CustomValues, Problem } from "../types";
import { COLOR_KEYS, LINK_KEYS, sectionOfKey } from "./fields";

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const MIN_CONTRAST = 4.5;

// WCAG 2.x contrast ratio of two 6 digit hex colors. Same formula as `contrastRatio` in
// "@/features/brand" (a test pins them together). It is repeated here because the brand index
// also exports server code (database access) that a client bundle must not pull in.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function problem(key: string, message: string): Problem {
  return { key, message, section: sectionOfKey(key) ?? "biz" };
}

// Returns the first value that must stop a save, or null. Order: color format, business name,
// links, then the contrast rule (build prompt section 3, rule 6). Messages name the key.
export function validateValues(values: CustomValues): Problem | null {
  const v = (k: string) => (values[k] ?? "").trim();

  for (const key of COLOR_KEYS) {
    if (!HEX6.test(v(key))) return problem(key, `custom_values.${key} needs a color like #2E7D32.`);
  }
  if (v("business_name") === "") return problem("business_name", "Enter the business name (custom_values.business_name).");
  for (const key of LINK_KEYS) {
    if (v(key) !== "" && !/^https:\/\/\S+$/i.test(v(key))) {
      return problem(key, `custom_values.${key} needs a link that starts with https://.`);
    }
  }
  if (contrast(v("main_color"), v("text_on_main_color")) < MIN_CONTRAST) {
    return problem(
      "main_color",
      "The text on your main color is hard to read. Make custom_values.main_color darker, or change custom_values.text_on_main_color.",
    );
  }
  return null;
}
