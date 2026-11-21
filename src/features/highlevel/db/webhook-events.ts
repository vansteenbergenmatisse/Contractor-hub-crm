import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/shared/lib/prisma";
import type { WebhookEventInput } from "../types";

// Idempotency by webhookId. The row is written first; a repeat hits the unique constraint
// (Prisma code P2002). A repeat of a processed event is skipped. A repeat of one that was stored
// but never finished (processedAt null, for example the database failed mid-way) runs again, so
// HighLevel's retry can still succeed. The actions themselves are safe to run twice.
export async function beginWebhookEvent(event: WebhookEventInput): Promise<"process" | "duplicate"> {
  const prisma = getPrisma();
  // The tenant is resolved here from the verified payload, never taken from a request.
  const tenant = event.locationId
    ? await prisma.tenant.findUnique({ where: { locationId: event.locationId }, select: { id: true } })
    : null;
  try {
    await prisma.webhookEvent.create({
      data: {
        webhookId: event.webhookId,
        type: event.type,
        tenantId: tenant?.id ?? null,
        locationId: event.locationId,
        companyId: event.companyId,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
    return "process";
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const existing = await prisma.webhookEvent.findUnique({
      where: { webhookId: event.webhookId },
      select: { processedAt: true },
    });
    return existing?.processedAt ? "duplicate" : "process";
  }
}

export async function markWebhookProcessed(webhookId: string, now: Date): Promise<void> {
  await getPrisma().webhookEvent.update({ where: { webhookId }, data: { processedAt: now } });
}
