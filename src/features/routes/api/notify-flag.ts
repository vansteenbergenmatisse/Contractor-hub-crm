type FlagEnv = Record<string, string | undefined>;

// Off unless ROUTES_NOTIFY_ENABLED is exactly "true" (the kill switch) and ROUTES_NOTIFY_TENANTS names
// this tenant id. There is no wildcard.
export function isRoutesNotifyEnabled(tenantId: string, env: FlagEnv = process.env): boolean {
  if (env.ROUTES_NOTIFY_ENABLED !== "true") return false;
  return (env.ROUTES_NOTIFY_TENANTS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(tenantId);
}
