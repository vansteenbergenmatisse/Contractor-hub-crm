import type { HighLevelUser } from "@/features/highlevel";
import type { GhlUserInput, ProvisionOutcome } from "@/features/auth";
import { emptyUserCounts, type UserCounts } from "../types";

// A tenant gets at most this many NEW CRM users (and set-password mails) per pass. A HighLevel
// sub-account admin can add users freely; without a cap that is a way to make us mail anyone.
// The rest are created on the next pass. A proposal, not a measured number.
export const MAX_NEW_USERS_PER_PASS = 50;
// When a pass would block more than half of a tenant's users at once (and the tenant has at least 5),
// it blocks nobody: that looks like a cut-off or partial HighLevel answer, not a real clean-up.
const SUSPICIOUS_MIN_LINKS = 5;

export type UserSyncDeps = {
  provision(input: GhlUserInput): Promise<{ outcome: ProvisionOutcome; userId: string | null }>;
  deactivate(tenantId: string, ghlUserId: string): Promise<boolean>;
  activeLinks(tenantId: string): Promise<Array<{ ghlUserId: string; userId: string }>>;
};

// Makes the CRM users of one tenant match the HighLevel user list: create or link the missing ones,
// update or restore the known ones, and block the CRM users whose HighLevel user is gone or deleted.
// Idempotent (keyed by tenant and HighLevel user id). One user failing does not stop the others.
// An EMPTY list never deactivates anyone: an empty answer is more likely a HighLevel problem than a
// sub-account with no users.
export async function syncTenantUsers(deps: UserSyncDeps, tenantId: string, users: readonly HighLevelUser[]): Promise<UserCounts> {
  const counts = emptyUserCounts();
  const listed = new Set<string>();
  for (const user of users) {
    if (user.deleted) continue;
    listed.add(user.id);
    try {
      const { outcome } = await deps.provision({
        allowCreate: counts.created < MAX_NEW_USERS_PER_PASS,
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
      else if (outcome === "skipped_agency") counts.skippedAgency += 1;
      else if (outcome === "capped") counts.capped += 1;
      else if (outcome === "skipped_invalid") counts.skippedInvalid += 1;
      else counts.skippedConflict += 1;
    } catch {
      counts.failed += 1;
    }
  }
  if (users.length > 0) {
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
  for (const key of Object.keys(out) as Array<keyof UserCounts>) out[key] = a[key] + b[key];
  return out;
}
