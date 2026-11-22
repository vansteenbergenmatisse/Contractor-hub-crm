import type { Business } from "@/features/app-shell";
import type { CustomValues } from "../types";
import { COLOR_KEYS } from "./fields";

// What a good Save changes on screen for this browser session. Nothing is written to HighLevel
// (write-back is Phase 3, off by default).

export const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string | undefined): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

// The color keys as CSS variables, the same mapping the server prints on <html> at first paint:
// `main_color` sets `--main-color`, and `text_color` also sets `--normal-text-color`. Only hex colors.
export function brandCssVars(values: CustomValues): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    const v = values[key]?.trim();
    if (isHexColor(v)) vars[`--${key.replaceAll("_", "-")}`] = v;
  }
  if (vars["--text-color"]) vars["--normal-text-color"] = vars["--text-color"];
  return vars;
}

type StyleTarget = { style: { setProperty: (name: string, value: string) => void } };

export function applyBrandVars(root: StyleTarget, values: CustomValues): void {
  for (const [name, value] of Object.entries(brandCssVars(values))) root.style.setProperty(name, value);
}

export type BusinessPatch = Pick<
  Business,
  | "name" | "owner" | "phone" | "email" | "address" | "hours" | "websiteUrl" | "logoUrl"
  | "bookingJobUrl" | "bookingQuoteUrl" | "googleProfileUrl" | "googleReviewUrl"
>;

const text = (values: CustomValues, key: string) => (values[key] ?? "").trim();
const https = (values: CustomValues, key: string) => {
  const v = text(values, key);
  return /^https:\/\/\S+$/i.test(v) ? v : null;
};

// The shell's business details from the custom values. A blank stays blank ("" or null), never a
// made-up value; links are https only.
export function businessPatchFromValues(values: CustomValues): BusinessPatch {
  return {
    name: text(values, "business_name"),
    owner: text(values, "business_owner_name"),
    phone: text(values, "business_phone_number"),
    email: text(values, "business_email"),
    address: text(values, "business_address"),
    hours: text(values, "business_hours"),
    websiteUrl: https(values, "business_website_url"),
    logoUrl: https(values, "business_logo"),
    bookingJobUrl: https(values, "request_a_job_booking_link"),
    bookingQuoteUrl: https(values, "request_a_quote_booking_link"),
    googleProfileUrl: https(values, "business_google_profile_url"),
    googleReviewUrl: https(values, "google_review_request_url"),
  };
}
