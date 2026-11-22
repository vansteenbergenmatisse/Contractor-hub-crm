import type { SignInBrand } from "@/features/brand";

// A fixed page of this app, carrying the personal link's slug. The slug was validated on the server
// and is only ever a query value: the path never comes from the URL.
export function clientHref(path: "/sign-in" | "/forgot-password" | "/reset-password", brand?: SignInBrand | null): string {
  return brand ? `${path}?client=${encodeURIComponent(brand.client)}` : path;
}
