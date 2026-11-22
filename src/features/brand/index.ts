// Public API of the brand feature. Other code imports from "@/features/brand" only.
export { buildBrand, contrastRatio, EMPTY_BRAND } from "./api/build-brand";
export { createBrandService } from "./api/brand-service";
export { getBrandService } from "./api/instance";
export { brandStyle } from "./api/style";
export { buildManifest, ICON_SIZES, parseIconRequest } from "./api/manifest";
export type { WebManifest } from "./api/manifest";
export type { Brand, BrandValue, BusinessProfile } from "./types";
