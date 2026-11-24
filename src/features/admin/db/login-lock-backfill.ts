import { getPrisma } from "@/shared/lib/prisma";
import type { BackfillInput } from "../api/login-lock-backfill";

export async function readLoginLockBackfillInput(): Promise<BackfillInput> {
  const prisma = getPrisma();
  const [tenants, users, removedLinks] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, status: true, loginLock: { select: { tenantId: true } } },
    }),
    prisma.user.findMany({ where: { tenantId: { not: null } }, select: { id: true, tenantId: true, disabledAt: true } }),
    prisma.ghlUserLink.findMany({ where: { deletedAt: { not: null } }, select: { userId: true, tenantId: true } }),
  ]);
  const removed = new Set(removedLinks.map((link) => `${link.tenantId}:${link.userId}`));
  return {
    tenants: tenants.map(({ loginLock, ...tenant }) => ({ ...tenant, locked: loginLock !== null })),
    users: users.flatMap((user) =>
      user.tenantId === null
        ? []
        : [{ tenantId: user.tenantId, disabled: user.disabledAt !== null, removed: removed.has(`${user.tenantId}:${user.id}`) }],
    ),
  };
}

// skipDuplicates: a lock made since the read stays as it is, with its original time.
export async function createLoginLocks(tenantIds: string[]): Promise<number> {
  const { count } = await getPrisma().tenantLoginLock.createMany({
    data: tenantIds.map((tenantId) => ({ tenantId })),
    skipDuplicates: true,
  });
  return count;
}
