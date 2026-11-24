import { isTenantFlagOn, type FlagEnv } from "./tenant-flag";

// Off unless SETTINGS_WRITE_BACK_ENABLED is exactly "true" (the kill switch). Then on for the tenant ids
// in SETTINGS_WRITE_BACK_TENANTS (exact match, no wildcard), or for every tenant when
// SETTINGS_WRITE_BACK_ALL is exactly "true". An id in SETTINGS_WRITE_BACK_EXCLUDE always stays off.
export function isWriteBackEnabled(tenantId: string, env: FlagEnv = process.env): boolean {
  return isTenantFlagOn("SETTINGS_WRITE_BACK", tenantId, env);
}
