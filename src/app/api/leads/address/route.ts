import { getGuards, hitRateLimit } from "@/features/auth";
import { handleAddressSearch } from "@/features/leads";
import { parseEnv } from "@/shared/config";
import { createPlacesSearch } from "@/shared/lib/places-search";

export const dynamic = "force-dynamic";

// Address suggestions through the server, so the Google key never reaches the browser.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleAddressSearch(request, {
      appOrigin: new URL(env.APP_URL).origin,
      currentUser: (req) => getGuards().currentUser(req),
      hit: hitRateLimit,
      now: () => new Date(),
      apiKey: process.env.GOOGLE_MAPS_SERVER_KEY,
      search: createPlacesSearch(),
    });
  } catch {
    return new Response(JSON.stringify({ error: "failed" }), { status: 500, headers: { "cache-control": "no-store", "content-type": "application/json" } });
  }
}
