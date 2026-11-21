// Types shared inside the brand feature.
export type Brand = {
  // CSS custom properties to print on the app root, e.g. { "--main-color": "#123456" }.
  cssVars: Record<string, string>;
  logoUrl: string | null;
  faviconUrl: string | null;
  backgroundImageUrl: string | null;
  businessName: string | null;
  ownerName: string | null;
  // Keys whose value was refused (not a color, or failed the contrast rule). Names only, no values.
  rejected: string[];
};

export type BrandValue = { key: string; value: string };
