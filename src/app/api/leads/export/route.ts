import { getGuards, hitRateLimit } from "@/features/auth";
import { loadBusiness } from "@/features/brand";
import { createTenantContactCreateAdapter, createTenantLocationZoneReader } from "@/features/highlevel";
import { handleLeadsExport } from "@/features/leads";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The owner's CSV export. POST so the browser sends an Origin header for the same-origin check.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleLeadsExport(request, {
      appOrigin: new URL(env.APP_URL).origin,
      currentUser: (req) => getGuards().currentUser(req),
      hit: hitRateLimit,
      now: () => new Date(),
      read: async (tenantId) => {
        const business = await loadBusiness(tenantId, "");
        return createTenantContactCreateAdapter().readForExport(tenantId, business.email ?? null);
      },
      readZone: async (tenantId) => (await createTenantLocationZoneReader(hitRateLimit)(tenantId)) ?? null,
    });
  } catch {
    return new Response(JSON.stringify({ error: "failed" }), { status: 500, headers: { "cache-control": "no-store", "content-type": "application/json" } });
  }
}
