import type { HighLevelUser } from "@/features/highlevel";
import { readSourceUnproven, type GhlUserInput, type ProvisionResult } from "@/features/auth";
import { emptyUserCounts, type UserCounts } from "../types";

// A tenant gets at most this many NEW CRM users (and set-password mails) per pass. A HighLevel
// sub-account admin can add users freely; without a cap that is a way to make us mail anyone.
// The rest are created on the next pass. A proposal, not a measured number.
export const MAX_NEW_USERS_PER_PASS = 50;
// When a pass would block more than half of a tenant's users at once (and the tenant has at least 5),
// it blocks nobody: that looks like a cut-off or partial HighLevel answer, not a real clean-up.
const SUSPICIOUS_MIN_LINKS = 5;

export type UserSyncDeps = {
  provision(input: GhlUserInput): Promise<ProvisionResult>;
  deactivate(tenantId: string, ghlUserId: string): Promise<boolean>;
  activeLinks(tenantId: string): Promise<Array<{ ghlUserId: string; userId: string }>>;
};

// The webhook, callback and cron paths may move a never-used account only when the old client's
// complete HighLevel list no longer has the email. That list cannot be proven complete today, so the
// reader answers "not complete" and the case stays a logged conflict. The on-visit sync gets no proof.
export function withSyncMoveProof(input: GhlUserInput): GhlUserInput {
  if (input.mayRestore === false) return input;
  return { ...input, moveProof: { kind: "sync", readSourceEmails: readSourceUnproven } };
}

// Makes the CRM users of one tenant match the HighLevel user list: create or link the missing ones,
// update or restore the known ones, and block the CRM users whose HighLevel user is gone or deleted.
// Idempotent (keyed by tenant and HighLevel user id). One user failing does not stop the others.
// An EMPTY list never deactivates anyone: an empty answer is more likely a HighLevel problem than a
// sub-account with no users.
// The on-visit sync passes `mayDeactivate: false` and `mayRestore: false`: it never blocks or
// unblocks anyone, and never moves a link.
export async function syncTenantUsers(
  deps: UserSyncDeps,
  tenantId: string,
  users: readonly HighLevelUser[],
  options: { mayDeactivate: boolean; mayRestore?: boolean } = { mayDeactivate: true },
): Promise<UserCounts> {
  const counts = emptyUserCounts();
  let restoreSkipped = 0;
  const conflictReasons: Record<string, number> = {};
  const listed = new Set<string>();
  for (const user of users) {
    if (user.deleted) continue;
    listed.add(user.id);
    try {
      const { outcome, reason } = await deps.provision({
        allowCreate: counts.created < MAX_NEW_USERS_PER_PASS,
        mayRestore: options.mayRestore,
        tenantId,
        ghlUserId: user.id,
        email: user.email,
        name: user.name,
        ghlRole: user.role,
        ghlRoleType: user.roleType,
      });
      if (outcome === "created") counts.created += 1;
      else if (outcome === "linked") counts.linked += 1;
      else if (outcome === "exists") counts.existing += 1;
      else if (outcome === "restored") counts.restored += 1;
      else if (outcome === "moved") counts.moved += 1;
      else if (outcome === "skipped_agency") counts.skippedAgency += 1;
      else if (outcome === "capped") counts.capped += 1;
      else if (outcome === "skipped_invalid") counts.skippedInvalid += 1;
      else if (outcome === "skipped_removed") restoreSkipped += 1;
      else {
        counts.skippedConflict += 1;
        const code = reason ?? "unspecified";
        conflictReasons[code] = (conflictReasons[code] ?? 0) + 1;
      }
    } catch {
      counts.failed += 1;
    }
  }
  if (restoreSkipped > 0) console.info(`Onboarding: users left for the webhook or daily sync, restoreSkipped=${restoreSkipped}`);
  // Counts and reason codes only, for an admin: no email, no ids.
  if (counts.moved > 0 || counts.skippedConflict > 0) {
    console.info(JSON.stringify({ audit: "email_conflicts", moved: counts.moved, reasons: conflictReasons }));
  }
  if (options.mayDeactivate && users.length > 0) {
    const links = await deps.activeLinks(tenantId);
    const deletedIds = new Set(users.filter((u) => u.deleted).map((u) => u.id));
    const gone = links.filter((link) => !(listed.has(link.ghlUserId) && !deletedIds.has(link.ghlUserId)));
    if (links.length >= SUSPICIOUS_MIN_LINKS && gone.length > links.length / 2) {
      counts.suspicious += gone.length;
      console.warn(`Onboarding: ${gone.length} of ${links.length} users would be blocked at once; blocked nobody (partial HighLevel answer?)`);
      return counts;
    }
    for (const link of gone) {
      try {
        if (await deps.deactivate(tenantId, link.ghlUserId)) counts.deactivated += 1;
      } catch {
        counts.failed += 1;
      }
    }
  }
  return counts;
}

export function addCounts(a: UserCounts, b: UserCounts): UserCounts {
  const out = emptyUserCounts();
  for (const key of Object.keys(out) as Array<keyof UserCounts>) out[key] = (a[key] ?? 0) + (b[key] ?? 0);
  return out;
}
