import { getPrisma } from "@/shared/lib/prisma";

export async function isDismissed(userId: string, tenantId: string): Promise<boolean> {
  const row = await getPrisma().mailboxPromptDismissal.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { userId: true },
  });
  return row !== null;
}

// A repeat is skipped, not an error, so dismissing twice is safe.
export async function saveDismissal(userId: string, tenantId: string): Promise<void> {
  await getPrisma().mailboxPromptDismissal.createMany({ data: [{ userId, tenantId }], skipDuplicates: true });
}

export async function clearDismissal(userId: string, tenantId: string): Promise<void> {
  await getPrisma().mailboxPromptDismissal.deleteMany({ where: { userId, tenantId } });
}
