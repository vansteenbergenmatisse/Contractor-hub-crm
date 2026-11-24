import { getGuards, hitRateLimit } from "@/features/auth";
import { createTenantContactCreateAdapter } from "@/features/highlevel";
import { handleLeadCreate, isLeadsCreateEnabled } from "@/features/leads";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

// Creates one contact, behind LEADS_CREATE_ENABLED and LEADS_CREATE_TENANTS. Off by default.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleLeadCreate(request, {
      appOrigin: new URL(env.APP_URL).origin,
      currentUser: (req) => getGuards().currentUser(req),
      hit: hitRateLimit,
      now: () => new Date(),
      isEnabled: (tenantId) => isLeadsCreateEnabled(tenantId),
      create: (tenantId, input) => createTenantContactCreateAdapter().createContact(tenantId, input),
    });
  } catch {
    return new Response(JSON.stringify({ error: "failed" }), { status: 500, headers: { "cache-control": "no-store", "content-type": "application/json" } });
  }
}
