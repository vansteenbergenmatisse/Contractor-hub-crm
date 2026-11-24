import { adminValuesRoute } from "@/features/admin-values";

export const dynamic = "force-dynamic";
// One save: lease, write, confirming reads. Same budget as the owner's Settings save.
export const maxDuration = 60;

// Admin only: save one custom value of a client, or lock or unlock it.
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }): Promise<Response> {
  try {
    const { tenantId } = await context.params;
    return await adminValuesRoute(request, tenantId);
  } catch {
    return new Response(JSON.stringify({ error: "failed" }), { status: 500, headers: { "cache-control": "no-store", "content-type": "application/json" } });
  }
}
