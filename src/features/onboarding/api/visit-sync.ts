import type { HighLevelUser } from "@/features/highlevel";
import { syncTenantUsers, type UserSyncDeps } from "./users";
import type { UserCounts } from "../types";

export const VISIT_SYNC_INTERVAL_MS = 10 * 60_000;

// The user sync of a page visit. It never blocks or unblocks anyone: its list may be partial or older
// than a removal, so only the webhook and daily-cron paths may deactivate, restore or relink.
export function syncUsersOnVisit(deps: UserSyncDeps, tenantId: string, users: readonly HighLevelUser[]): Promise<UserCounts> {
  return syncTenantUsers(deps, tenantId, users, { mayDeactivate: false, mayRestore: false });
}

export type VisitSyncDeps = {
  now(): Date;
  claim(tenantId: string, now: Date, cutoff: Date): Promise<boolean>;
  syncUsers(tenantId: string): Promise<UserCounts>;
};

// A Prisma error code or the error's class name: never the message, which can hold personal data.
export function errorLabel(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^P\d{4}$/.test(code)) return code;
  return error instanceof Error ? error.name : "unknown error";
}

// Syncs the users of one tenant when its last on-visit sync is over 10 minutes old. Never rejects:
// it runs after the response, and a failure waits for the next visit, webhook or daily cron.
export async function runVisitSync(deps: VisitSyncDeps, tenantId: string): Promise<void> {
  let claimed: boolean;
  try {
    const now = deps.now();
    claimed = await deps.claim(tenantId, now, new Date(now.getTime() - VISIT_SYNC_INTERVAL_MS));
  } catch (error) {
    console.error(`Visit sync: skipped, claim step failed: ${errorLabel(error)}`);
    return;
  }
  if (!claimed) return;
  try {
    const counts = await deps.syncUsers(tenantId);
    console.info(`Visit sync: created=${counts.created} linked=${counts.linked} restored=${counts.restored} deactivated=${counts.deactivated} failed=${counts.failed} conflicts=${counts.skippedConflict} capped=${counts.capped} suspicious=${counts.suspicious}`);
  } catch (error) {
    console.error(`Visit sync: user sync step failed: ${errorLabel(error)}`);
  }
}

// Hands the task to the scheduler (Next.js `after()`). A scheduler error never reaches the page.
export function deferVisitSync(schedule: (task: () => Promise<void>) => void, task: () => Promise<void>): void {
  try {
    schedule(task);
  } catch (error) {
    console.error(`Visit sync: schedule step failed: ${errorLabel(error)}`);
  }
}
