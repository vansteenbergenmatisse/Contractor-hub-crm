import { headers } from "next/headers";
import { currentUserFromHeaders } from "@/features/auth";
import { buildManifest, EMPTY_BRAND, getBrandService } from "@/features/brand";

export const dynamic = "force-dynamic";

// The web app manifest of the signed-in tenant (its name, colors and logo). Signed out, or when the
// custom values cannot be read, a neutral manifest. Private: it holds the client's branding.
export async function GET() {
  let brand = EMPTY_BRAND;
  try {
    const user = await currentUserFromHeaders(await headers());
    if (user?.tenantId) brand = await getBrandService().getBrand(user.tenantId);
  } catch {
    brand = EMPTY_BRAND;
  }
  return new Response(JSON.stringify(buildManifest(brand)), {
    headers: { "content-type": "application/manifest+json", "cache-control": "private, no-store" },
  });
}
