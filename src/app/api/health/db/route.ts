import { checkDatabase } from "@/shared/lib/db-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkDatabase();
  return Response.json(result, { status: result.ok ? 200 : 503 });
}
