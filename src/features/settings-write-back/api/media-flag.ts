import { isTenantFlagOn, type FlagEnv } from "./tenant-flag";

// Off unless SETTINGS_MEDIA_REPLACE_ENABLED is exactly "true" (the kill switch). Then on for the tenant
// ids in SETTINGS_MEDIA_REPLACE_TENANTS (exact match, no wildcard), or for every tenant when
// SETTINGS_MEDIA_REPLACE_ALL is exactly "true". An id in SETTINGS_MEDIA_REPLACE_EXCLUDE always stays off.
export function isMediaReplaceEnabled(tenantId: string, env: FlagEnv = process.env): boolean {
  return isTenantFlagOn("SETTINGS_MEDIA_REPLACE", tenantId, env);
}
