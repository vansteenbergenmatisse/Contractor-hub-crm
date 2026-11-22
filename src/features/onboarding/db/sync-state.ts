import { getPrisma } from "@/shared/lib/prisma";

// Claims this tenant's on-visit sync. True for exactly one caller per interval, across server
// instances: the conditional update can only match a stale row once, and only one insert of a first
// row counts (a duplicate is skipped, not an error). A claim is not given back when the sync fails,
// so a HighLevel outage costs at most one attempt per tenant per interval. Other errors (such as the
// table not being migrated yet) are thrown: the caller then skips the sync.
export async function claimVisitSync(tenantId: string, now: Date, cutoff: Date): Promise<boolean> {
  const prisma = getPrisma();
  const updated = await prisma.tenantSyncState.updateMany({
    where: { tenantId, OR: [{ lastClaimedAt: null }, { lastClaimedAt: { lt: cutoff } }] },
    data: { lastClaimedAt: now },
  });
  if (updated.count === 1) return true;
  const inserted = await prisma.tenantSyncState.createMany({ data: [{ tenantId, lastClaimedAt: now }], skipDuplicates: true });
  return inserted.count === 1;
}

// Takes one set-password mail from the tenant's budget for this UTC day. True when the mail may go.
// The day rollover is conditional and the count is one conditional increment, so simultaneous
// callers on any server instance can never pass the cap together.
export async function reserveSetPasswordMail(tenantId: string, day: Date, cap: number): Promise<boolean> {
  const prisma = getPrisma();
  await prisma.tenantSyncState.createMany({ data: [{ tenantId }], skipDuplicates: true });
  await prisma.tenantSyncState.updateMany({
    where: { tenantId, OR: [{ mailDay: null }, { mailDay: { lt: day } }] },
    data: { mailDay: day, mailCount: 0 },
  });
  const reserved = await prisma.tenantSyncState.updateMany({
    where: { tenantId, mailDay: { gte: day }, mailCount: { lt: cap } },
    data: { mailCount: { increment: 1 } },
  });
  return reserved.count === 1;
}
