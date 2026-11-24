import { createHash } from "node:crypto";
import { getPrisma } from "@/shared/lib/prisma";
import type { AccountSnapshot, MoveInput, MoveReason, MoveStore } from "../api/account-move";

type Client = ReturnType<typeof getPrisma>;
type Reader = Pick<Client, "user" | "ghlUserLink">;

// A one-way fingerprint of the stored password hash: it shows that the hash changed, nothing more.
export const fingerprint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("hex");

async function snapshotOf(db: Reader, userId: string): Promise<AccountSnapshot | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      tenantId: true,
      disabledAt: true,
      unusedMarker: { select: { tenantId: true, credentialFingerprint: true } },
      accounts: { select: { providerId: true, password: true } },
      _count: { select: { sessions: true } },
    },
  });
  if (!user) return null;
  const link = await db.ghlUserLink.findUnique({ where: { userId }, select: { deletedAt: true } });
  return {
    role: user.role,
    tenantId: user.tenantId,
    disabledAt: user.disabledAt,
    linkDeletedAt: link?.deletedAt ?? null,
    marker: user.unusedMarker,
    credentials: user.accounts.map((a) => ({ providerId: a.providerId, passwordFingerprint: a.password ? fingerprint(a.password) : null })),
    sessionCount: user._count.sessions,
  };
}

// Written right after the sync creates an account. The user row is locked, so a session already being
// inserted is seen here and the account gets no marker.
async function markUnused(client: Client, userId: string, tenantId: string): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const accounts = await tx.account.findMany({ where: { userId }, select: { providerId: true, password: true } });
    if (accounts.length !== 1 || accounts[0].providerId !== "credential" || !accounts[0].password) return;
    if ((await tx.session.count({ where: { userId } })) > 0) return;
    const credentialFingerprint = fingerprint(accounts[0].password);
    await tx.unusedAccountMarker.createMany({ data: [{ userId, tenantId, credentialFingerprint }], skipDuplicates: true });
  });
}

// One transaction. `FOR UPDATE` serializes two attempts and also waits for a session insert in
// flight (its foreign key takes a lock on the user row); the marker can be deleted only once.
async function moveInTransaction(
  client: Client,
  input: MoveInput,
  verify: (snapshot: AccountSnapshot, fromTenantId: string) => MoveReason | null,
): Promise<"moved" | MoveReason> {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
    const snapshot = await snapshotOf(tx, input.userId);
    if (!snapshot) return "unprovable";
    const refused = verify(snapshot, input.fromTenantId);
    if (refused) return refused;
    const target = await tx.tenant.findUnique({ where: { id: input.toTenantId }, select: { status: true } });
    if (target?.status !== "connected") return "target_not_connected";
    const taken = await tx.ghlUserLink.findUnique({
      where: { tenantId_ghlUserId: { tenantId: input.toTenantId, ghlUserId: input.ghlUserId } },
      select: { userId: true },
    });
    if (taken && taken.userId !== input.userId) return "link_taken";
    // Deleted, never re-created: a moved account is no longer "proven unused", so it cannot move again.
    const claimed = await tx.unusedAccountMarker.deleteMany({ where: { userId: input.userId, tenantId: input.fromTenantId } });
    if (claimed.count !== 1) return "raced";
    await tx.session.deleteMany({ where: { userId: input.userId } });
    // A set-password link mailed while the account was in the old client stops working.
    await tx.verification.deleteMany({ where: { identifier: { startsWith: "reset-password:" }, value: input.userId } });
    await tx.ghlUserLink.upsert({
      where: { userId: input.userId },
      create: { tenantId: input.toTenantId, ghlUserId: input.ghlUserId, userId: input.userId },
      update: { tenantId: input.toTenantId, ghlUserId: input.ghlUserId, deletedAt: null },
    });
    await tx.user.update({ where: { id: input.userId }, data: { tenantId: input.toTenantId, role: input.role } });
    return "moved";
  });
}

// After an embed session is inserted, under the same user lock as a move: is the account still in the
// tenant the sign-in was resolved for? If not, the session is removed before any cookie is sent. A
// session inserted before a move makes that move refuse ("used"); one inserted after it fails here.
async function confirmSessionTenant(client: Client, input: { userId: string; tenantId: string; sessionToken: string }): Promise<boolean> {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { tenantId: true } });
    if (user?.tenantId === input.tenantId) return true;
    await tx.session.deleteMany({ where: { sessionKey: input.sessionToken, userId: input.userId } });
    return false;
  });
}

// The client is a parameter so the transaction can be exercised on a throwaway local Postgres.
export function createMoveStore(getClient: () => Client = getPrisma): MoveStore & { clearMarker(userId: string): Promise<void>; confirmSessionTenant(input: { userId: string; tenantId: string; sessionToken: string }): Promise<boolean> } {
  return {
    readSnapshot: (userId) => snapshotOf(getClient(), userId),
    markUnused: (userId, tenantId) => markUnused(getClient(), userId, tenantId),
    moveInTransaction: (input, verify) => moveInTransaction(getClient(), input, verify),
    clearMarker: async (userId) => { await getClient().unusedAccountMarker.deleteMany({ where: { userId } }); },
    confirmSessionTenant: (input) => confirmSessionTenant(getClient(), input),
  };
}
