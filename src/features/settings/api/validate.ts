import type { CustomValues, Problem } from "../types";
import { COLOR_KEYS, LINK_KEYS, labelOfKey, sectionOfKey } from "./fields";

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HTTPS = /^https:\/\/\S+$/i;
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

// Returns the first value that must stop a save, or null. Order as in the design: color format,
// business name, links, then the contrast rule (build prompt section 3, rule 6). Messages name the
// field by its label.
//
// With `saved` (what Save stored last), only what the owner changed is checked, so a new client whose
// custom values are empty can save one color, and an old value HighLevel holds never blocks a save.
// A changed color may be cleared (the app then uses its own color); the business name may not.
// Without `saved`, every value is checked, as in the design.
export function validateValues(values: CustomValues, saved?: CustomValues): Problem | null {
  const v = (k: string) => (values[k] ?? "").trim();
  const changed = (k: string) => !saved || v(k) !== (saved[k] ?? "").trim();
  const mayBeEmpty = saved !== undefined;

  for (const key of COLOR_KEYS) {
    if (!changed(key) || (mayBeEmpty && v(key) === "")) continue;
    if (!HEX6.test(v(key))) return problem(key, `${labelOfKey(key)} needs a color like #2E7D32.`);
  }
  if (changed("business_name") && v("business_name") === "") return problem("business_name", "Enter the business name.");
  for (const key of LINK_KEYS) {
    if (changed(key) && v(key) !== "" && !HTTPS.test(v(key))) {
      return problem(key, `${labelOfKey(key)} needs a link that starts with https://.`);
    }
  }
  const main = v("main_color");
  const onMain = v("text_on_main_color");
  if (
    (changed("main_color") || changed("text_on_main_color")) &&
    HEX6.test(main) && HEX6.test(onMain) &&
    contrast(main, onMain) < MIN_CONTRAST
  ) {
    return problem(
      "main_color",
      `The text on your main color is hard to read. Make ${labelOfKey("main_color")} darker, or change ${labelOfKey("text_on_main_color")}.`,
    );
  }
  return null;
}
