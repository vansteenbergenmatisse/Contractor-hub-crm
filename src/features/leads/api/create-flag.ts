type FlagEnv = Record<string, string | undefined>;

// Off unless LEADS_CREATE_ENABLED is exactly "true" (the kill switch) and LEADS_CREATE_TENANTS names
// this tenant id. There is no wildcard.
export function isLeadsCreateEnabled(tenantId: string, env: FlagEnv = process.env): boolean {
  if (env.LEADS_CREATE_ENABLED !== "true") return false;
  return (env.LEADS_CREATE_TENANTS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(tenantId);
}
