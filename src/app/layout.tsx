import type { ReactNode } from "react";
import { headers } from "next/headers";
import { currentUserFromHeaders } from "@/features/auth";
import { brandStyle, EMPTY_BRAND, getBrandService } from "@/features/brand";
import "./globals.css";

export const metadata = { title: "Contractor Hub CRM" };

// Brand at first paint: a signed-in tenant user gets their sub-account's colors printed on <html>
// by the server. Signed-out pages, admins and any lookup failure get the design's default colors.
async function loadBrand() {
  try {
    const user = await currentUserFromHeaders(await headers());
    if (!user?.tenantId) return EMPTY_BRAND;
    return await getBrandService().getBrand(user.tenantId);
  } catch {
    return EMPTY_BRAND;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await loadBrand();
  return (
    <html lang="en" style={brandStyle(brand)}>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        {brand.faviconUrl ? <link rel="icon" href={brand.faviconUrl} /> : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
