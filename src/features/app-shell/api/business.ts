import type { Business } from "../types";

const initials = (words: string[]): string => ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).trim().toUpperCase();
const clean = (value: string | null | undefined): string => value?.trim() ?? "";

export type BusinessInput = {
  name?: string | null;
  owner?: string | null;
  keyword?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hours?: string | null;
  websiteUrl?: string | null;
  universalCta?: string | null;
  logoUrl?: string | null;
  bookingJobUrl?: string | null;
  bookingQuoteUrl?: string | null;
  googleProfileUrl?: string | null;
  googleReviewUrl?: string | null;
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
// the sub-account's custom values; every field has a plain fallback so an empty value never breaks
// the frame and never shows a made-up business fact.
export function buildBusiness(input: BusinessInput): Business {
  const name = clean(input.name) || "Your business";
  const owner = clean(input.owner) || "Owner";
  const place = [clean(input.city), clean(input.state)].filter(Boolean).join(", ");
  const tag = [clean(input.keyword), place].filter(Boolean).join(" · ");
  const link = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    name,
    init: initials(name.split(/\s+/)),
    tag,
    owner,
    ownerInit: initials(owner.split(/\s+/)),
    first: owner.split(/\s+/)[0],
    logoUrl: link(input.logoUrl),
    keyword: clean(input.keyword),
    phone: clean(input.phone),
    email: clean(input.email),
    address: clean(input.address),
    city: clean(input.city),
    state: clean(input.state),
    hours: clean(input.hours),
    websiteUrl: link(input.websiteUrl),
    site: siteOf(input.websiteUrl),
    cta: clean(input.universalCta),
    bookingJobUrl: link(input.bookingJobUrl),
    bookingQuoteUrl: link(input.bookingQuoteUrl),
    googleProfileUrl: link(input.googleProfileUrl),
    googleReviewUrl: link(input.googleReviewUrl),
  };
}

// The same details under the custom-value key names the pages' sample text was written with, so a
// page reads `values.business_phone_number` whether the data is the sample or the real sub-account.
export function businessValues(business: Business) {
  return {
    business_name: business.name === "Your business" ? "" : business.name,
    business_owner_name: business.owner === "Owner" ? "" : business.owner,
    business_phone_number: business.phone,
    business_email: business.email,
    business_address: business.address,
    business_hours: business.hours,
    business_main_city: business.city,
    business_main_state_abbreviation: business.state,
    business_main_keyword: business.keyword,
    business_website_url: business.websiteUrl ?? "",
  };
}
