import { getGuards, hitRateLimit } from "@/features/auth";
import { handleSaveValues, isWriteBackEnabled, saveFailure, saveTenantValues } from "@/features/settings-write-back";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Saves changed Settings values to the signed-in owner's HighLevel sub-account. Off by default.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleSaveValues(request, {
      appOrigin: new URL(env.APP_URL).origin,
      currentUser: (req) => getGuards().currentUser(req),
      isEnabled: (tenantId) => isWriteBackEnabled(tenantId),
      hit: hitRateLimit,
      save: saveTenantValues,
    });
  } catch {
    return saveFailure();
  }
}
