type FlagEnv = Record<string, string | undefined>;

// Off unless both server flags say so: SETTINGS_WRITE_BACK_ENABLED is exactly "true" (the kill switch)
// and SETTINGS_WRITE_BACK_TENANTS names this tenant id. There is no wildcard, so turning it on for one
// sub-account never turns it on for all.
export function isWriteBackEnabled(tenantId: string, env: FlagEnv = process.env): boolean {
  if (env.SETTINGS_WRITE_BACK_ENABLED !== "true") return false;
  return (env.SETTINGS_WRITE_BACK_TENANTS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(tenantId);
}
