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

// Reads `--flag=a,b`. Absent gives null. Anything ambiguous is a problem, never a guess.
function readIdList(args: readonly string[], flag: string, problems: string[]): string[] | null {
  const found = args.filter((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (found.length === 0) return null;
  if (found.length > 1) {
    problems.push(`${flag} was passed more than once.`);
    return [];
  }
  const [only] = found;
  if (!only?.startsWith(`${flag}=`)) {
    problems.push(`${flag} needs a value: ${flag}=<id,id>.`);
    return [];
  }
  const ids = only.slice(flag.length + 1).split(",");
  if (ids.some((id) => id === "")) problems.push(`${flag} has an empty entry.`);
  const repeated = ids.filter((id, index) => id !== "" && ids.indexOf(id) !== index);
  if (repeated.length > 0) problems.push(`${flag} lists an id twice: ${[...new Set(repeated)].join(", ")}`);
  return ids.filter((id) => id !== "");
}

function whyNotPlanned(id: string, input: BackfillInput, plan: BackfillPlan): string {
  const tenant = input.tenants.find((row) => row.id === id);
  if (!tenant) return "unknown client";
  if (tenant.locked) return "already locked";
  if (plan.needsReview.some((row) => row.id === id)) return "every user was removed, needs a decision";
  return "no longer qualifies";
}

// Every planned client must be decided: listed to lock, or excluded. A client that appeared since
// the review is in neither list, so the run stops instead of skipping it silently.
function checkReview(args: readonly string[], input: BackfillInput, plan: BackfillPlan) {
  const problems: string[] = [];
  const listed = readIdList(args, "--tenants", problems);
  const excluded = readIdList(args, "--exclude", problems) ?? [];
  if (listed === null) problems.push("--apply needs --tenants=<id,id> with the clients you reviewed.");
  const toLock = listed ?? [];
  const planned = new Set(plan.toLock.map((tenant) => tenant.id));
  for (const id of toLock.filter((id) => excluded.includes(id))) problems.push(`${id}: both listed and excluded.`);
  for (const id of new Set([...toLock, ...excluded])) {
    if (!planned.has(id)) problems.push(`${id}: ${whyNotPlanned(id, input, plan)}.`);
  }
  for (const id of planned) {
    if (!toLock.includes(id) && !excluded.includes(id)) problems.push(`${id}: qualifies but was not reviewed.`);
  }
  return { toLock, problems };
}

// Blocks with no HighLevel removal mark: an admin's block or a removal that stopped halfway.
function describeForReview(tenant: BackfillTenant, users: BackfillUser[]) {
  const own = users.filter((user) => user.tenantId === tenant.id);
  const unmarked = own.filter((user) => !user.removed).length;
  return `${describe(tenant)}  blocked without a removal mark: ${unmarked} of ${own.length}`;
}

// The path the script uses. Dry run unless the exact flag `--apply` is passed, and an apply locks
// only ids a person listed, after checking them against a fresh plan. Any mismatch writes nothing.
export async function runReviewedLoginLockBackfill(
  args: readonly string[],
  deps: {
    read: () => Promise<BackfillInput>;
    createLocks: (tenantIds: string[]) => Promise<number>;
    log: (line: string) => void;
  },
): Promise<BackfillPlan & { applied: boolean; created: number; problems: string[] }> {
  const input = await deps.read();
  const plan = planLoginLockBackfill(input);
  deps.log(`Clients already off, without a lock: ${plan.toLock.length}`);
  plan.toLock.forEach((tenant) => deps.log(describeForReview(tenant, input.users)));
  deps.log(`Every user removed from HighLevel, not locked, needs a decision: ${plan.needsReview.length}`);
  plan.needsReview.forEach((tenant) => deps.log(describe(tenant)));
  if (!args.includes("--apply")) {
    deps.log("Dry run. Nothing was written. To lock, add --apply --tenants=<id,id> --exclude=<id,id>.");
    return { ...plan, applied: false, created: 0, problems: [] };
  }
  const { toLock, problems } = checkReview(args, input, plan);
  if (problems.length > 0) {
    deps.log("Nothing was written. The list does not match the current plan:");
    problems.forEach((problem) => deps.log(`  ${problem}`));
    return { ...plan, applied: false, created: 0, problems };
  }
  const created = await deps.createLocks(toLock);
  deps.log(`Locks created: ${created}`);
  return { ...plan, applied: true, created, problems: [] };
}

// Lower-level run with no review list. The script does not call it; use the reviewed path above.
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
