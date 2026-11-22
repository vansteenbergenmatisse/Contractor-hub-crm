import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { currentUserFromHeaders } from "@/features/auth";
import { EMPTY_BRAND, getBrandService, parseIconRequest } from "@/features/brand";

export const dynamic = "force-dynamic";

// The home-screen icon: the client's logo (or favicon) centered on its main color, as a PNG, because
// iPhone and Android installs need a PNG and the custom values hold an SVG or other image. Falls back
// to the business initials on the same color when there is no image or it cannot be drawn. The size
// comes from a fixed list; the image link is the https custom value (already validated by the brand
// builder), fetched by the image renderer.
export async function GET(request: Request) {
  const { size, maskable } = parseIconRequest(new URL(request.url).searchParams);
  let brand = EMPTY_BRAND;
  try {
    const user = await currentUserFromHeaders(await headers());
    if (user?.tenantId) brand = await getBrandService().getBrand(user.tenantId);
  } catch {
    brand = EMPTY_BRAND;
  }
  const background = brand.cssVars["--main-color"] ?? "#2e7d32";
  const initials = (brand.businessName ?? "CRM").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const image = brand.logoUrl ?? brand.faviconUrl;
  // A maskable icon keeps its picture inside the central 80% so any round or squircle mask fits.
  const inner = Math.round(size * (maskable ? 0.5 : 0.62));
  const render = (withImage: boolean) =>
    new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background }}>
          {withImage && image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} width={inner} height={inner} style={{ objectFit: "contain" }} alt="" />
          ) : (
            <div style={{ display: "flex", color: brand.cssVars["--text-on-main-color"] ?? "#ffffff", fontSize: Math.round(size * 0.42), fontWeight: 700 }}>{initials}</div>
          )}
        </div>
      ),
      { width: size, height: size },
    );
  try {
    return await render(true);
  } catch {
    return render(false);
  }
}
