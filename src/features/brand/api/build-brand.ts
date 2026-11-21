import type { Brand, BrandValue } from "../types";

// Folder 02_Branding of the sub-account's custom values (build prompt section 5). Font keys are
// ignored. Each key maps to the CSS variable of the same name, underscores to dashes.
const COLOR_KEYS = [
  "main_color", "main_hover_color", "main_light_color", "main_background_color", "main_border_color",
  "sub_color", "highlight_color", "error_color", "background_color", "section_background_color",
  "border_color", "text_color", "light_text_color", "text_on_main_color",
] as const;

const MIN_CONTRAST = 4.5;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov)$/i;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;

// Only a plain hex color gets into a style attribute: anything else could carry CSS.
function parseHex(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return HEX.test(value) ? value : null;
}

function channels(hex: string): [number, number, number] {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 2.x contrast ratio of two hex colors.
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function httpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const text = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);

export function buildBrand(values: BrandValue[]): Brand {
  const byKey = new Map<string, string>();
  for (const { key, value } of values) if (!byKey.has(key)) byKey.set(key, value);

  const cssVars: Record<string, string> = {};
  const rejected: string[] = [];
  for (const key of COLOR_KEYS) {
    const raw = byKey.get(key);
    if (raw === undefined) continue;
    const hex = parseHex(raw);
    if (hex === null) {
      rejected.push(key);
      continue;
    }
    cssVars[`--${key.replaceAll("_", "-")}`] = hex;
  }

  // Contrast rule: a main color the on-main text cannot be read on is refused, and the key says which.
  const main = cssVars["--main-color"];
  const onMain = cssVars["--text-on-main-color"];
  if (main && onMain && contrastRatio(main, onMain) < MIN_CONTRAST) {
    delete cssVars["--main-color"];
    rejected.push("main_color");
  }

  if (cssVars["--text-color"]) cssVars["--normal-text-color"] = cssVars["--text-color"];

  const background = httpsUrl(byKey.get("business_main_background_video_or_image"));
  return {
    cssVars,
    logoUrl: httpsUrl(byKey.get("business_logo")),
    faviconUrl: httpsUrl(byKey.get("business_favicon_url")),
    backgroundImageUrl: background && !VIDEO_EXTENSIONS.test(new URL(background).pathname) ? background : null,
    businessName: text(byKey.get("business_name")),
    ownerName: text(byKey.get("business_owner_name")),
    rejected,
  };
}

export const EMPTY_BRAND: Brand = buildBrand([]);
