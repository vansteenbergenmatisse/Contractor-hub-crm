import { getPrisma } from "@/shared/lib/prisma";
import type { InviteRecord, InviteRole, InviteTenant } from "../api/invites";

// The only place the auth feature reads and writes invites (and the tenant row an invite needs).

export async function findTenantForInvite(tenantId: string): Promise<InviteTenant | null> {
  return getPrisma().tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, locationId: true, companyId: true, status: true },
  });
}

export async function emailTaken(email: string): Promise<boolean> {
  return (await getPrisma().user.count({ where: { email } })) > 0;
}

export async function insertInvite(input: {
  tenantId: string;
  email: string;
  role: InviteRole;
  hlUserId: string;
  codeHash: string;
  expiresAt: Date;
  createdById: string | null;
}): Promise<{ id: string }> {
  return getPrisma().invite.create({ data: input, select: { id: true } });
}

export async function findInviteByCodeHash(codeHash: string): Promise<InviteRecord | null> {
  const row = await getPrisma().invite.findUnique({
    where: { codeHash },
    select: { id: true, tenantId: true, email: true, role: true, hlUserId: true, expiresAt: true, usedAt: true },
  });
  if (!row || (row.role !== "owner" && row.role !== "office")) return null;
  return { ...row, role: row.role };
}

// One UPDATE with the open conditions in its WHERE: of two concurrent accepts only one sees count 1.
export async function claimInvite(id: string, at: Date): Promise<boolean> {
  const result = await getPrisma().invite.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: at } },
    data: { usedAt: at },
  });
  return result.count === 1;
}

export async function releaseInvite(id: string): Promise<void> {
  await getPrisma().invite.updateMany({ where: { id }, data: { usedAt: null } });
}

export async function deleteInvite(id: string): Promise<void> {
  await getPrisma().invite.deleteMany({ where: { id } });
}
