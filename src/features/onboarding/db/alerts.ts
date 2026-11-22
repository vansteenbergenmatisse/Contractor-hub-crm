import { getPrisma } from "@/shared/lib/prisma";

const ALERT_EVERY_MS = 24 * 3600_000;

// Which of these sub-accounts may be alerted about now: never alerted, or last alerted over 24 hours
// ago. Marks them as alerted (so the next run stays quiet) and forgets sub-accounts that
// have the app now. Returns only the ones to alert about.
export async function claimAlerts(
  companyId: string,
  missing: ReadonlyArray<{ locationId: string; name: string | null }>,
  now: Date,
): Promise<Array<{ locationId: string; name: string | null }>> {
  const prisma = getPrisma();
  await prisma.missingAppAlert.deleteMany({ where: { companyId, locationId: { notIn: missing.map((m) => m.locationId) } } });
  const cutoff = new Date(now.getTime() - ALERT_EVERY_MS);
  const due: Array<{ locationId: string; name: string | null }> = [];
  for (const item of missing) {
    // Atomic, so two overlapping sync runs cannot both claim the same alert: a
    // conditional update that only one of them can win, and an insert that fails for the second.
    const updated = await prisma.missingAppAlert.updateMany({
      where: { locationId: item.locationId, lastAlertedAt: { lt: cutoff } },
      data: { lastAlertedAt: now, name: item.name },
    });
    if (updated.count === 1) {
      due.push(item);
      continue;
    }
    try {
      await prisma.missingAppAlert.create({ data: { locationId: item.locationId, companyId, name: item.name, lastAlertedAt: now } });
      due.push(item);
    } catch {
      // The row exists and was alerted recently (or another run just created it): not due.
    }
  }
  return due;
}

// A mail that could not be sent: forget the claim so the next run tries again.
export async function releaseAlerts(locationIds: readonly string[]): Promise<void> {
  if (locationIds.length === 0) return;
  await getPrisma().missingAppAlert.deleteMany({ where: { locationId: { in: [...locationIds] } } });
}
