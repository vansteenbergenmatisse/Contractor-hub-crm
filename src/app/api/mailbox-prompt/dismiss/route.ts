import { getGuards } from "@/features/auth";
import { dismissFailure, dismissMailboxPrompt, handleDismiss } from "@/features/mailbox-prompt";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";

// Hides the mailbox reminder for the signed-in user in their tenant.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleDismiss(request, {
      appOrigin: new URL(env.APP_URL).origin,
      currentUser: (req) => getGuards().currentUser(req),
      dismiss: dismissMailboxPrompt,
    });
  } catch {
    return dismissFailure();
  }
}
