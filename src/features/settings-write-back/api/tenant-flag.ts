export type FlagEnv = Record<string, string | undefined>;

const idsOf = (list: string | undefined) => (list ?? "").split(",").map((id) => id.trim()).filter(Boolean);

// One server flag family, `<PREFIX>_ENABLED`, `_TENANTS`, `_ALL` and `_EXCLUDE`:
// - ENABLED must be exactly "true". It is the kill switch: clearing it stops every tenant at once.
// - ALL exactly "true" turns it on for every tenant (default-on for every connected client).
// - TENANTS names single tenants by exact id. There is no wildcard and no partial match.
// - EXCLUDE names tenants by exact id that stay off, and always wins over ALL and TENANTS.
export function isTenantFlagOn(prefix: string, tenantId: string, env: FlagEnv): boolean {
  const id = tenantId.trim();
  if (!id || env[`${prefix}_ENABLED`] !== "true") return false;
  if (idsOf(env[`${prefix}_EXCLUDE`]).includes(id)) return false;
  return env[`${prefix}_ALL`] === "true" || idsOf(env[`${prefix}_TENANTS`]).includes(id);
}
