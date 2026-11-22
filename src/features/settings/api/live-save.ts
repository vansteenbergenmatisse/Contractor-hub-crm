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

// globals.css declares the default colors again on every `.brand-scope` element (the app frame, the
// search sheet), so a variable on <html> alone never reaches the app. This rule names <html> and
// `.brand-scope` with a higher specificity than `:root:root,.brand-scope`, so the saved colors win
// everywhere, also in a sheet opened later. Values are validated hex colors only; "" when none.
export function brandScopeRule(values: CustomValues): string {
  const body = Object.entries(brandCssVars(values)).map(([k, v]) => `${k}:${v}`).join(";");
  return body ? `:root:root:root,.brand-scope.brand-scope.brand-scope{${body}}` : "";
}

export const LIVE_STYLE_ID = "settings-brand-live";

// Puts the saved colors on <html> and in one <style> in <head> (kept up to date, never duplicated).
export function applyBrandToDocument(doc: Document, values: CustomValues): void {
  applyBrandVars(doc.documentElement, values);
  let el = doc.getElementById(LIVE_STYLE_ID);
  if (!el) {
    el = doc.createElement("style");
    el.id = LIVE_STYLE_ID;
    doc.head.appendChild(el);
  }
  el.textContent = brandScopeRule(values);
}

export type BusinessPatch = Pick<
  Business,
  | "name" | "owner" | "phone" | "email" | "address" | "hours" | "websiteUrl" | "logoUrl"
  | "bookingJobUrl" | "bookingQuoteUrl" | "googleProfileUrl" | "googleReviewUrl"
  | "seasonalOffer" | "referralReward" | "county"
>;

const text = (values: CustomValues, key: string) => (values[key] ?? "").trim();
const https = (values: CustomValues, key: string) => {
  const v = text(values, key);
  return /^https:\/\/\S+$/i.test(v) ? v : null;
};

// The shell's business details from the custom values, for this browser session. Only filled-in
// values are sent: an empty value is left out, so it never overrides what the shell shows (an empty
// owner name must not turn the menu card into "Owner"). Links are https only; a link that is not
// https is left out too. Nothing is ever made up.
export function businessPatchFromValues(values: CustomValues): Partial<BusinessPatch> {
  const out: Partial<BusinessPatch> = {};
  const texts: [keyof BusinessPatch, string][] = [
    ["name", "business_name"], ["owner", "business_owner_name"], ["phone", "business_phone_number"],
    ["email", "business_email"], ["address", "business_address"], ["hours", "business_hours"],
    ["seasonalOffer", "seasonal_offer_text"], ["referralReward", "referral_reward_text"], ["county", "business_main_county"],
  ];
  const links: [keyof BusinessPatch, string][] = [
    ["websiteUrl", "business_website_url"], ["logoUrl", "business_logo"], ["bookingJobUrl", "request_a_job_booking_link"],
    ["bookingQuoteUrl", "request_a_quote_booking_link"], ["googleProfileUrl", "business_google_profile_url"],
    ["googleReviewUrl", "google_review_request_url"],
  ];
  for (const [field, key] of texts) {
    const v = text(values, key);
    if (v) out[field] = v;
  }
  for (const [field, key] of links) {
    const v = https(values, key);
    if (v) out[field] = v;
  }
  return out;
}
