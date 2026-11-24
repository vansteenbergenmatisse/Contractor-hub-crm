import { getGuards, hitRateLimit } from "@/features/auth";
import { handleMediaReplace, isMediaReplaceEnabled, isWriteBackEnabled, lockedKeysOf, mediaFailure, replaceTenantImage } from "@/features/settings-write-back";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Change image in Settings: a new file in the owner's HighLevel media library, then the custom value
// points at it. Off by default; it also needs the Settings write-back flags for the tenant.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    return await handleMediaReplace(request, {
      appOrigin: new URL(env.APP_URL).origin,
      currentUser: (req) => getGuards().currentUser(req),
      isEnabled: (tenantId) => isWriteBackEnabled(tenantId) && isMediaReplaceEnabled(tenantId),
      hit: hitRateLimit,
      replace: replaceTenantImage,
      isLocked: async (tenantId, key) => (await lockedKeysOf(tenantId)).has(key),
    });
  } catch {
    return mediaFailure();
  }
}
