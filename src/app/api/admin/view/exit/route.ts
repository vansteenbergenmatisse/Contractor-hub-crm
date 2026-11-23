import { getGuards, handleExitClientView } from "@/features/auth";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

// Ends the read-only client view by clearing its cookie.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleExitClientView(request, { guards: getGuards(), appOrigin: new URL(env.APP_URL).origin });
  } catch {
    return new Response("Server is not configured.", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
