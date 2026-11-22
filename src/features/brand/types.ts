// Types shared inside the brand feature.
export type Brand = {
  // CSS custom properties to print on the app root, e.g. { "--main-color": "#123456" }.
  cssVars: Record<string, string>;
  logoUrl: string | null;
  faviconUrl: string | null;
  backgroundImageUrl: string | null;
  businessName: string | null;
  ownerName: string | null;
  profile: BusinessProfile;
  // Keys whose value was refused (not a color, or failed the contrast rule). Names only, no values.
  rejected: string[];
};

// Business details from folder 01 of the custom values, by the keys the real sub-accounts use. Any
// field may be missing (null). Links are https only. Nothing here is ever made up.
export type BusinessProfile = {
  name: string | null;
  owner: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  hours: string | null;
  keyword: string | null;
  websiteUrl: string | null;
  universalCta: string | null;
  bookingJobUrl: string | null;
  bookingQuoteUrl: string | null;
  googleProfileUrl: string | null;
  googleReviewUrl: string | null;
};

export type BrandValue = { key: string; value: string };
