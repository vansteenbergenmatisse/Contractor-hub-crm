import type { ReactNode } from "react";
import { brandScopeCss, brandStyle, EMPTY_BRAND, getBrandService } from "@/features/brand";
import { getRequestUser } from "./session";
import "./globals.css";

// Brand at first paint: a signed-in tenant user gets their sub-account's colors printed on <html>
// by the server, plus their favicon and the "Add to Home Screen" app (manifest, icon, theme color).
// Signed-out pages, admins and any lookup failure get the design's default colors and no app link.
async function loadBrand() {
  try {
    const user = await getRequestUser();
    if (!user?.tenantId) return { brand: EMPTY_BRAND, tenant: false };
    // An admin's client view never refreshes the client's token, and is not an installable app.
    if (user.viewing) return { brand: await getBrandService().getBrandReadOnly(user.tenantId), tenant: false };
    return { brand: await getBrandService().getBrand(user.tenantId), tenant: true };
  } catch {
    return { brand: EMPTY_BRAND, tenant: false };
  }
}

// The tab title is the client's business name (a neutral name when there is none).
export async function generateMetadata() {
  const { brand } = await loadBrand();
  return { title: brand.businessName ?? "Contractor Hub CRM" };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { brand, tenant } = await loadBrand();
  const title = brand.businessName ?? "Contractor Hub CRM";
  const scopeCss = brandScopeCss(brand);
  return (
    <html lang="en" style={brandStyle(brand)}>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        {/* The design CSS re-declares its default colors on .brand-scope (the app frame), so the
            tenant's colors are printed once more as a rule that wins there. Hex values only. */}
        {scopeCss ? <style id="brand-first-paint">{scopeCss}</style> : null}
        {brand.faviconUrl ? <link rel="icon" href={brand.faviconUrl} /> : null}
        {tenant ? (
          <>
            {/* With credentials: browsers fetch the manifest without cookies otherwise, and the signed-out
                answer is the neutral app instead of this tenant's. */}
            <link rel="manifest" href="/api/manifest" crossOrigin="use-credentials" />
            <link rel="apple-touch-icon" href="/api/pwa-icon?size=180" />
            <meta name="theme-color" content={brand.cssVars["--main-color"] ?? "#2e7d32"} />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-title" content={title} />
          </>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
