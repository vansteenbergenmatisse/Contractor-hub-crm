import type { TenantStatusValue } from "../types";

export type BackfillTenant = { id: string; name: string | null; status: TenantStatusValue; locked: boolean };
// `removed`: the user's HighLevel link is marked deleted, so the block came from HighLevel.
export type BackfillUser = { tenantId: string; disabled: boolean; removed: boolean };
export type BackfillInput = { tenants: BackfillTenant[]; users: BackfillUser[] };
export type BackfillPlan = { toLock: BackfillTenant[]; needsReview: BackfillTenant[] };

// A client counts as already off when it has no lock, has users, all are blocked, and at least one
// block did not come from a HighLevel removal. When every user was removed, nothing shows an admin
// turned the client off, so it is listed for a person to decide and never locked here.
export function planLoginLockBackfill({ tenants, users }: BackfillInput): BackfillPlan {
  const plan: BackfillPlan = { toLock: [], needsReview: [] };
  for (const tenant of tenants) {
    if (tenant.locked) continue;
    const own = users.filter((user) => user.tenantId === tenant.id);
    if (own.length === 0 || own.some((user) => !user.disabled)) continue;
    (own.some((user) => !user.removed) ? plan.toLock : plan.needsReview).push(tenant);
  }
  return plan;
}

const describe = (tenant: BackfillTenant) => `  ${tenant.id}  ${tenant.name ?? "(no name)"}  [${tenant.status}]`;

// Dry run unless the exact flag `--apply` is passed.
export async function runLoginLockBackfill(
  args: readonly string[],
  deps: {
    read: () => Promise<BackfillInput>;
    createLocks: (tenantIds: string[]) => Promise<number>;
    log: (line: string) => void;
  },
): Promise<BackfillPlan & { applied: boolean; created: number }> {
  const apply = args.includes("--apply");
  const plan = planLoginLockBackfill(await deps.read());
  deps.log(`Clients already off, without a lock: ${plan.toLock.length}`);
  plan.toLock.forEach((tenant) => deps.log(describe(tenant)));
  deps.log(`Every user removed from HighLevel, not locked, needs a decision: ${plan.needsReview.length}`);
  plan.needsReview.forEach((tenant) => deps.log(describe(tenant)));
  if (!apply) {
    deps.log("Dry run. Nothing was written. Add --apply to create the locks.");
    return { ...plan, applied: false, created: 0 };
  }
  const created = plan.toLock.length > 0 ? await deps.createLocks(plan.toLock.map((tenant) => tenant.id)) : 0;
  deps.log(`Locks created: ${created}`);
  return { ...plan, applied: true, created };
}
