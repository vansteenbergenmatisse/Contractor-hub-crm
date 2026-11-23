import { ImageResponse } from "next/og";
import { getRequestUser } from "../../session";
import { EMPTY_BRAND, fetchLogoDataUri, getBrandService, parseIconRequest } from "@/features/brand";

export const dynamic = "force-dynamic";

// The home-screen icon: the client's logo (or favicon) centered on its main color, as a PNG, because
// iPhone and Android installs need a PNG and the custom values hold an SVG or other image. The image
// is fetched HERE with limits (allowed host, no redirects, timeout, size cap, image types: see the
// brand feature's logo.ts) and handed to the renderer as a data URI, so the renderer never fetches a
// client-controlled address. No image, or one that fails the checks, gives the business initials on
// the same color. Private and uncached: it carries one client's branding.
export async function GET(request: Request) {
  const { size, maskable } = parseIconRequest(new URL(request.url).searchParams);
  let brand = EMPTY_BRAND;
  try {
    const user = await getRequestUser();
    if (user?.tenantId) brand = await (user.viewing ? getBrandService().getBrandReadOnly(user.tenantId) : getBrandService().getBrand(user.tenantId));
  } catch {
    brand = EMPTY_BRAND;
  }
  const background = brand.cssVars["--main-color"] ?? "#2e7d32";
  const initials = (brand.businessName ?? "CRM").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const source = brand.logoUrl ?? brand.faviconUrl;
  const picture = source ? await fetchLogoDataUri(source) : null;
  // A maskable icon keeps its picture inside the central 80% so any round or squircle mask fits.
  const inner = Math.round(size * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background }}>
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} width={inner} height={inner} style={{ objectFit: "contain" }} alt="" />
        ) : (
          <div style={{ display: "flex", color: brand.cssVars["--text-on-main-color"] ?? "#ffffff", fontSize: Math.round(size * 0.42), fontWeight: 700 }}>{initials}</div>
        )}
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "private, no-store" } },
  );
}
