import { getPrisma } from "@/shared/lib/prisma";
import type { Role } from "../types";

// Everything the provisioning code needs from the database. Only this file touches Prisma for it.
export type LinkRow = { userId: string; deletedAt: Date | null };
export type FullLinkRow = LinkRow & { tenantId: string; ghlUserId: string };
export type UserRow = { id: string; name: string; role: Role; tenantId: string | null; disabledAt: Date | null };

export async function findLink(tenantId: string, ghlUserId: string): Promise<LinkRow | null> {
  return getPrisma().ghlUserLink.findUnique({
    where: { tenantId_ghlUserId: { tenantId, ghlUserId } },
    select: { userId: true, deletedAt: true },
  });
}

// Idempotent: a second insert of the same (tenant, GHL user) is ignored.
export async function insertLink(tenantId: string, ghlUserId: string, userId: string): Promise<void> {
  await getPrisma().ghlUserLink.upsert({
    where: { tenantId_ghlUserId: { tenantId, ghlUserId } },
    create: { tenantId, ghlUserId, userId },
    update: {},
  });
}

export async function setLinkDeleted(tenantId: string, ghlUserId: string, deletedAt: Date | null): Promise<void> {
  await getPrisma().ghlUserLink.updateMany({ where: { tenantId, ghlUserId }, data: { deletedAt } });
}

export async function listActiveLinks(tenantId: string): Promise<Array<{ ghlUserId: string; userId: string }>> {
  return getPrisma().ghlUserLink.findMany({ where: { tenantId, deletedAt: null }, select: { ghlUserId: true, userId: true } });
}

const userSelect = { id: true, name: true, role: true, tenantId: true, disabledAt: true } as const;

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return getPrisma().user.findUnique({ where: { email }, select: userSelect });
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return getPrisma().user.findUnique({ where: { id }, select: userSelect });
}

export async function findLinkByUserId(userId: string): Promise<FullLinkRow | null> {
  return getPrisma().ghlUserLink.findUnique({ where: { userId }, select: { userId: true, deletedAt: true, tenantId: true, ghlUserId: true } });
}

// Moves a user's link to a new HighLevel id and clears `deletedAt`, in one statement.
export async function relinkUser(userId: string, tenantId: string, ghlUserId: string): Promise<void> {
  await getPrisma().ghlUserLink.update({ where: { userId }, data: { tenantId, ghlUserId, deletedAt: null } });
}
