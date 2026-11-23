import { getRequestUser } from "../../session";
import { buildManifest, EMPTY_BRAND, getBrandService } from "@/features/brand";

export const dynamic = "force-dynamic";

// The web app manifest of the signed-in tenant (its name, colors and logo). Signed out, or when the
// custom values cannot be read, a neutral manifest. Private: it holds the client's branding.
export async function GET() {
  let brand = EMPTY_BRAND;
  try {
    const user = await getRequestUser();
    if (user?.tenantId) brand = await (user.viewing ? getBrandService().getBrandReadOnly(user.tenantId) : getBrandService().getBrand(user.tenantId));
  } catch {
    brand = EMPTY_BRAND;
  }
  return new Response(JSON.stringify(buildManifest(brand)), {
    headers: { "content-type": "application/manifest+json", "cache-control": "private, no-store" },
  });
}
