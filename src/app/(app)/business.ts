import { cache } from "react";
import { buildBusiness } from "@/features/app-shell";
import { getBrandService } from "@/features/brand";

// The business and owner names of a tenant, from the sub-account's custom values (a plain fallback,
// never a made-up name). Cached per request so the layout and a page share one lookup.
export const loadBusiness = cache(async (tenantId: string, fallbackOwner: string) => {
  try {
    const brand = await getBrandService().getBrand(tenantId);
    const p = brand.profile;
    return buildBusiness({
      name: p.name,
      owner: p.owner ?? fallbackOwner,
      keyword: p.keyword,
      city: p.city,
      state: p.state,
      phone: p.phone,
      email: p.email,
      address: p.address,
      hours: p.hours,
      websiteUrl: p.websiteUrl,
      universalCta: p.universalCta,
      logoUrl: brand.logoUrl,
      bookingJobUrl: p.bookingJobUrl,
      bookingQuoteUrl: p.bookingQuoteUrl,
      googleProfileUrl: p.googleProfileUrl,
      googleReviewUrl: p.googleReviewUrl,
    });
  } catch {
    return buildBusiness({ owner: fallbackOwner });
  }
});
