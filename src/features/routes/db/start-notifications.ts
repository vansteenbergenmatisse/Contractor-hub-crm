import { getPrisma } from "@/shared/lib/prisma";

// The once-per-job record. The unique tenant + appointment index decides who may fire: of any number
// of racing requests, exactly one inserts the row.
export async function claimStartNotification(input: { tenantId: string; appointmentId: string; actorId: string }): Promise<boolean> {
  const { count } = await getPrisma().routeStartNotification.createMany({ data: [input], skipDuplicates: true });
  return count === 1;
}

export async function finishStartNotification(tenantId: string, appointmentId: string, outcome: string): Promise<void> {
  await getPrisma().routeStartNotification.updateMany({
    where: { tenantId, appointmentId, outcome: "pending" },
    data: { outcome, finishedAt: new Date() },
  });
}

export async function readStartOutcome(tenantId: string, appointmentId: string): Promise<string | null> {
  const row = await getPrisma().routeStartNotification.findUnique({
    where: { tenantId_appointmentId: { tenantId, appointmentId } },
    select: { outcome: true },
  });
  return row?.outcome ?? null;
}

export async function readStartOutcomes(tenantId: string, appointmentIds: string[]): Promise<Array<{ appointmentId: string; outcome: string }>> {
  if (appointmentIds.length === 0) return [];
  return getPrisma().routeStartNotification.findMany({
    where: { tenantId, appointmentId: { in: appointmentIds } },
    select: { appointmentId: true, outcome: true },
  });
}
