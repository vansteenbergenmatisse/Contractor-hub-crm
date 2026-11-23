type FlagEnv = Record<string, string | undefined>;

// Off unless both server flags say so: SETTINGS_MEDIA_REPLACE_ENABLED is exactly "true" (the kill
// switch) and SETTINGS_MEDIA_REPLACE_TENANTS names this exact tenant id. There is no wildcard.
export function isMediaReplaceEnabled(tenantId: string, env: FlagEnv = process.env): boolean {
  if (env.SETTINGS_MEDIA_REPLACE_ENABLED !== "true") return false;
  return (env.SETTINGS_MEDIA_REPLACE_TENANTS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(tenantId);
}
