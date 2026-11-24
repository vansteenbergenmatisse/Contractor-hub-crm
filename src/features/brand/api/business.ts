import { cache } from "react";
import { buildBusiness, type Business } from "@/features/app-shell";
import { getBrandService } from "./instance";
import type { Brand } from "../types";

// The business details the frame and pages show, from the brand profile (a plain fallback, never a
// made-up name). `fallbackOwner` is used when the sub-account has no owner name.
export function businessFromBrand(brand: Brand, fallbackOwner: string): Business {
  const p = brand.profile;
  return buildBusiness({
    name: p.name,
    owner: p.owner ?? fallbackOwner,
    keyword: p.keyword,
    city: p.city,
    state: p.state,
    county: p.county,
    seasonalOfferText: p.seasonalOffer,
    referralRewardText: p.referralReward,
    phone: p.phone,
    email: p.email,
    address: p.address,
    hours: p.hours,
    hoursUnreadable: p.hoursUnreadable,
    websiteUrl: p.websiteUrl,
    universalCta: p.universalCta,
    logoUrl: brand.logoUrl,
    bookingJobUrl: p.bookingJobUrl,
    bookingQuoteUrl: p.bookingQuoteUrl,
    googleProfileUrl: p.googleProfileUrl,
    googleReviewUrl: p.googleReviewUrl,
  });
}

// A tenant's business details through the 5-minute brand cache. Cached per request as well, so the
// layout and a page share one lookup.
// `readOnly` (an admin's client view) never refreshes a token.
export const loadBusiness = cache(async (tenantId: string, fallbackOwner: string, readOnly = false): Promise<Business> => {
  try {
    const service = getBrandService();
    const brand = await (readOnly ? service.getBrandReadOnly(tenantId) : service.getBrand(tenantId));
    return businessFromBrand(brand, fallbackOwner);
  } catch {
    return buildBusiness({ owner: fallbackOwner });
  }
});
