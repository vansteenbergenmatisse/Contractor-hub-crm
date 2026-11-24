import type { Business } from "../types";

const initials = (words: string[]): string => ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).trim().toUpperCase();
const clean = (value: string | null | undefined): string => value?.trim() ?? "";

export type BusinessInput = {
  name?: string | null;
  owner?: string | null;
  keyword?: string | null;
  city?: string | null;
  // Custom value `business_main_county`, or "".
  county?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hours?: string | null;
  hoursUnreadable?: boolean;
  websiteUrl?: string | null;
  universalCta?: string | null;
  logoUrl?: string | null;
  bookingJobUrl?: string | null;
  bookingQuoteUrl?: string | null;
  googleProfileUrl?: string | null;
  googleReviewUrl?: string | null;
  // Custom values `seasonal_offer_text` and `referral_reward_text` (Automations texts).
  seasonalOfferText?: string | null;
  referralRewardText?: string | null;
};

function siteOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// What the frame and the pages show about the business and the signed-in person. Inputs come from
// the sub-account's custom values. A missing value stays empty ("" or null), never a made-up word
// (docs/tenant-branding.md), and whatever shows it renders nothing in its place.
export function buildBusiness(input: BusinessInput): Business {
  const name = clean(input.name);
  const owner = clean(input.owner);
  const place = [clean(input.city), clean(input.state)].filter(Boolean).join(", ");
  const tag = [clean(input.keyword), place].filter(Boolean).join(" · ");
  const link = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    name,
    init: initials(name.split(/\s+/)),
    tag,
    owner,
    ownerInit: initials(owner.split(/\s+/)),
    first: owner.split(/\s+/)[0] ?? "",
    logoUrl: link(input.logoUrl),
    keyword: clean(input.keyword),
    phone: clean(input.phone),
    email: clean(input.email),
    address: clean(input.address),
    city: clean(input.city),
    county: clean(input.county),
    state: clean(input.state),
    hours: clean(input.hours),
    ...(input.hoursUnreadable ? { hoursUnreadable: true } : {}),
    websiteUrl: link(input.websiteUrl),
    site: siteOf(input.websiteUrl),
    cta: clean(input.universalCta),
    bookingJobUrl: link(input.bookingJobUrl),
    bookingQuoteUrl: link(input.bookingQuoteUrl),
    googleProfileUrl: link(input.googleProfileUrl),
    googleReviewUrl: link(input.googleReviewUrl),
    seasonalOffer: clean(input.seasonalOfferText),
    referralReward: clean(input.referralRewardText),
  };
}

// The same details under the custom-value key names the pages' sample text was written with, so a
// page reads `values.business_phone_number` whether the data is the sample or the real sub-account.
export function businessValues(business: Business) {
  return {
    business_name: business.name,
    business_owner_name: business.owner,
    business_phone_number: business.phone,
    business_email: business.email,
    business_address: business.address,
    business_hours: business.hours,
    business_main_city: business.city,
    business_main_county: business.county,
    business_main_state_abbreviation: business.state,
    business_main_keyword: business.keyword,
    business_website_url: business.websiteUrl ?? "",
    seasonal_offer_text: business.seasonalOffer,
    referral_reward_text: business.referralReward,
  };
}

// Fields a patch may set. The rest (init, ownerInit, first, site, tag) are worked out again.
const PATCH_KEYS = [
  "name", "owner", "keyword", "city", "county", "state", "phone", "email", "address", "hours", "cta",
  "logoUrl", "websiteUrl", "bookingJobUrl", "bookingQuoteUrl", "googleProfileUrl", "googleReviewUrl",
  "seasonalOffer", "referralReward",
] as const;

export type BusinessPatch = Partial<Business>;

// The details with a patch on top (Settings edits in this browser session). "" or null blanks a
// field (text to "", links to null); derived and unknown fields in the patch are ignored and
// recomputed by `buildBusiness`. A blank owner keeps the owner already shown (the signed-in person's
// name), so a Settings save without an owner name never blanks the menu card.
export function patchBusiness(base: Business, patch: BusinessPatch): Business {
  const input: BusinessInput = {
    name: base.name, owner: base.owner, keyword: base.keyword, city: base.city, county: base.county, state: base.state,
    phone: base.phone, email: base.email, address: base.address, hours: base.hours, universalCta: base.cta,
    logoUrl: base.logoUrl, websiteUrl: base.websiteUrl, bookingJobUrl: base.bookingJobUrl, bookingQuoteUrl: base.bookingQuoteUrl,
    googleProfileUrl: base.googleProfileUrl, googleReviewUrl: base.googleReviewUrl,
    seasonalOfferText: base.seasonalOffer, referralRewardText: base.referralReward,
  };
  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = (patch as Record<string, unknown>)[key];
    const next = typeof value === "string" ? value : null;
    if (key === "cta") input.universalCta = next;
    else if (key === "seasonalOffer") input.seasonalOfferText = next;
    else if (key === "referralReward") input.referralRewardText = next;
    else if (key === "owner" && !next?.trim()) continue;
    else input[key] = next;
  }
  return buildBusiness(input);
}

// Only the fields a patch may set, so an override never carries unknown keys.
export function pickPatch(patch: BusinessPatch): BusinessPatch {
  const out: Record<string, unknown> = {};
  for (const key of PATCH_KEYS) if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = (patch as Record<string, unknown>)[key];
  return out as BusinessPatch;
}

// How long a saved value may stay on screen without the server showing it. A proposal, not measured.
export const OVERRIDE_MAX_AGE_MS = 60_000;

// Values on screen, what the server held before them, and when each saved field was saved. A field
// without a time is a visit-only edit (nothing was sent), which has no age limit.
export type BusinessOverride = { patch: BusinessPatch; base: Business; savedAt: Partial<Record<string, number>> };

// The same object when every field stays.
function keepFields(override: BusinessOverride, keep: (key: (typeof PATCH_KEYS)[number]) => boolean): BusinessOverride {
  const patch: Record<string, unknown> = {};
  const savedAt: Partial<Record<string, number>> = {};
  let dropped = false;
  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(override.patch, key)) continue;
    if (keep(key)) {
      patch[key] = override.patch[key];
      savedAt[key] = override.savedAt[key];
    } else dropped = true;
  }
  return dropped ? { patch: patch as BusinessPatch, base: override.base, savedAt } : override;
}

// Each field stays only while the server still holds its pre-save value: once the server moves on, it
// has the save or a later edit made in HighLevel, and it wins for good.
export function settleOverride(override: BusinessOverride, server: Business): BusinessOverride {
  return keepFields(override, (key) => override.base[key] === server[key]);
}

// A value HighLevel reverted looks like a save the server has not shown yet, so each field has an age limit.
export function dropExpiredOverride(override: BusinessOverride, at: number): BusinessOverride {
  return keepFields(override, (key) => {
    const saved = override.savedAt[key];
    return saved === undefined || saved + OVERRIDE_MAX_AGE_MS > at;
  });
}

// When the oldest field reaches its age limit. Null: nothing is held.
export function nextOverrideExpiry(override: BusinessOverride): number | null {
  const times = Object.values(override.savedAt).filter((time): time is number => time !== undefined);
  return times.length > 0 ? Math.min(...times) + OVERRIDE_MAX_AGE_MS : null;
}

// A new save on top: fields the server already moved past are dropped first.
// `savedAtTime` null: a visit-only edit.
export function addToOverride(override: BusinessOverride, patch: BusinessPatch, server: Business, savedAtTime: number | null): BusinessOverride {
  const settled = settleOverride(override, server);
  const picked = pickPatch(patch);
  const savedAt = { ...settled.savedAt };
  for (const key of Object.keys(picked)) {
    if (savedAtTime === null) delete savedAt[key];
    else savedAt[key] = savedAtTime;
  }
  return { patch: { ...settled.patch, ...picked }, base: server, savedAt };
}
