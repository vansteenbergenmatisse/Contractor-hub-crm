import { getPrisma } from "@/shared/lib/prisma";
import type { AccountSnapshot } from "../api/account-move";
import type { AccountRow } from "../api/sign-in-link";
import { isRole } from "../types";
import { fingerprint } from "./account-move";

// Reads for the admin's "Send sign-in email", and the removal of a person's older set-password links.
const MAX_LISTED = 200;

const accountSelect = { id: true, email: true, name: true, role: true, tenantId: true } as const;

function toRow(user: { id: string; email: string; name: string; role: string; tenantId: string | null }): AccountRow | null {
  return isRole(user.role) ? { ...user, role: user.role } : null;
}

export async function findAccountByEmail(email: string): Promise<AccountRow | null> {
  const user = await getPrisma().user.findUnique({ where: { email }, select: accountSelect });
  return user ? toRow(user) : null;
}

export async function findAccountById(id: string): Promise<AccountRow | null> {
  const user = await getPrisma().user.findUnique({ where: { id }, select: accountSelect });
  return user ? toRow(user) : null;
}

// The same facts the account move reads (marker, credential fingerprint, sessions, blocks), for every
// non-admin user of one tenant, in one query.
export async function listTenantAccounts(tenantId: string): Promise<Array<AccountRow & { snapshot: AccountSnapshot }>> {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { tenantId, role: { not: "admin" } },
    orderBy: { createdAt: "asc" },
    take: MAX_LISTED,
    select: {
      ...accountSelect,
      disabledAt: true,
      unusedMarker: { select: { tenantId: true, credentialFingerprint: true } },
      accounts: { select: { providerId: true, password: true } },
      _count: { select: { sessions: true } },
    },
  });
  const links = await prisma.ghlUserLink.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
    select: { userId: true, deletedAt: true },
  });
  const removed = new Map(links.map((link) => [link.userId, link.deletedAt]));
  const out: Array<AccountRow & { snapshot: AccountSnapshot }> = [];
  for (const user of users) {
    const row = toRow(user);
    if (!row) continue;
    out.push({
      ...row,
      snapshot: {
        role: row.role,
        tenantId: user.tenantId,
        disabledAt: user.disabledAt,
        linkDeletedAt: removed.get(user.id) ?? null,
        marker: user.unusedMarker,
        credentials: user.accounts.map((a) => ({ providerId: a.providerId, passwordFingerprint: a.password ? fingerprint(a.password) : null })),
        sessionCount: user._count.sessions,
      },
    });
  }
  return out;
}
