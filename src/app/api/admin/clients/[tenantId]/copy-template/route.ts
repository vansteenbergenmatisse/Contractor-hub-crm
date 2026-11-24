import { templateCopyRoute } from "@/features/template-copy";

export const dynamic = "force-dynamic";
// One batch of the copy (reads, paced writes, maybe an image) fits inside this.
export const maxDuration = 60;

// Admin only: preview or apply "Copy values from template" for one client.
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }): Promise<Response> {
  try {
    const { tenantId } = await context.params;
    return await templateCopyRoute(request, tenantId);
  } catch {
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
