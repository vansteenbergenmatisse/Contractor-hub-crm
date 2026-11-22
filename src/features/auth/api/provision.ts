import type { InvitedUserInput } from "./auth";
import { normalizeEmail } from "./invite-check";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
import type { LinkRow, UserRow } from "../db/ghl-links";
import type { Role } from "../types";
import { tryMoveAccount, type MoveProof, type MoveReason, type MoveStore } from "./account-move";

// Creates, links, updates and deactivates CRM users from HighLevel users (no invite, nobody asks for
// access). Decisions (PROGRESS.md, 2026-11-22):
//  - a sub-account admin becomes our `owner`, any other HighLevel user our `office`. NEVER our `admin`:
//    that role is Forge Forward staff and sees every client.
//  - users with an agency-level role are not created per sub-account (staff; the email is unique).
//  - an email that already belongs to another tenant, or to an admin, is skipped and counted.
export type GhlUserInput = {
  tenantId: string;
  ghlUserId: string;
  email: string;
  name: string | null;
  // HighLevel's roles.role ("admin" or "user") and roles.type ("account" or "agency"); null when unknown.
  ghlRole: string | null;
  ghlRoleType: string | null;
  // False once the caller has created its per-pass maximum of new users: a user who would have to be
  // created is then reported as "capped" and nothing is created or mailed.
  allowCreate?: boolean;
  // False on the on-visit sync, whose user list can be older than a removal: a blocked user stays
  // blocked and no link moves ("skipped_removed"). Left out: restoring is allowed.
  mayRestore?: boolean;
  // What proves this person belongs here when their email sits in another client. Left out: no move.
  moveProof?: MoveProof;
};

export type ProvisionOutcome =
  | "created" | "linked" | "exists" | "restored" | "skipped_agency" | "skipped_conflict" | "skipped_invalid" | "skipped_removed" | "capped" | "moved";

export type ProvisionResult = { outcome: ProvisionOutcome; userId: string | null; reason?: MoveReason };

export type ProvisionDeps = {
  createUser(input: InvitedUserInput): Promise<{ userId: string }>;
  updateUser(userId: string, patch: { name?: string; role?: Role }): Promise<void>;
  setDisabled(userId: string, disabled: boolean): Promise<void>;
  // Sends the "set your password" mail. A failure is logged by the caller and does not undo the user.
  sendSetPassword(email: string): Promise<void>;
  randomPassword(): string;
  store: {
    findLink(tenantId: string, ghlUserId: string): Promise<LinkRow | null>;
    // The link of a CRM user (a user has at most one). Used when HighLevel re-created a person with a
    // new id: the link moves to the new id instead of colliding.
    findLinkByUserId(userId: string): Promise<(LinkRow & { tenantId: string; ghlUserId: string }) | null>;
    relinkUser(userId: string, tenantId: string, ghlUserId: string): Promise<void>;
    insertLink(tenantId: string, ghlUserId: string, userId: string): Promise<void>;
    setLinkDeleted(tenantId: string, ghlUserId: string, deletedAt: Date | null): Promise<void>;
    findUserByEmail(email: string): Promise<UserRow | null>;
    findUserById(id: string): Promise<UserRow | null>;
  };
  now(): Date;
  // Moving a never-used account between clients. Left out: an email conflict always stays a conflict.
  moves?: MoveStore;
};

export function mapGhlRole(role: string | null): Extract<Role, "owner" | "office"> {
  return role?.toLowerCase() === "admin" ? "owner" : "office";
}

export async function provisionGhlUser(deps: ProvisionDeps, input: GhlUserInput): Promise<ProvisionResult> {
  if (input.ghlRoleType?.toLowerCase() === "agency") return { outcome: "skipped_agency", userId: null };
  const role = mapGhlRole(input.ghlRole);
  const email = normalizeEmail(input.email);
  // An address HighLevel let through but that is not a plausible mailbox: no user, no mail.
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { outcome: "skipped_invalid", userId: null };
  const name = input.name?.trim() || email.split("@")[0];

  const link = await deps.store.findLink(input.tenantId, input.ghlUserId);
  if (link) {
    if (link.deletedAt && input.mayRestore === false) return { outcome: "skipped_removed", userId: null };
    const user = await deps.store.findUserById(link.userId);
    if (user) {
      const patch: { name?: string; role?: Role } = {};
      if (input.name?.trim() && user.name !== name) patch.name = name;
      if (user.role !== "admin" && user.role !== role) patch.role = role;
      if (patch.name || patch.role) await deps.updateUser(user.id, patch);
    }
    if (link.deletedAt) {
      // Only a disable made by this sync (the link was marked deleted) is undone. A user an admin
      // turned off by hand keeps that state: their link was never marked deleted.
      await deps.store.setLinkDeleted(input.tenantId, input.ghlUserId, null);
      await deps.setDisabled(link.userId, false);
      return { outcome: "restored", userId: link.userId };
    }
    return { outcome: "exists", userId: link.userId };
  }

  const linkExisting = async (): Promise<ProvisionResult | null> => {
    const existing = await deps.store.findUserByEmail(email);
    if (!existing) return null;
    if (existing.tenantId !== input.tenantId || existing.role === "admin") {
      const moved = await tryMoveAccount(deps.moves, input.moveProof, existing, {
        tenantId: input.tenantId, ghlUserId: input.ghlUserId, role, email, mayRestore: input.mayRestore,
      });
      if (moved === "moved") return { outcome: "moved", userId: existing.id };
      return { outcome: "skipped_conflict", userId: null, reason: moved };
    }
    const old = await deps.store.findLinkByUserId(existing.id);
    if (old) {
      // Any relink clears the link's deleted mark, so a path that may not restore never relinks.
      if (input.mayRestore === false) return { outcome: "skipped_removed", userId: null };
      // HighLevel deleted and re-added this person (new id, same email): move the link, and undo the
      // block this sync put on them while the old id was missing.
      const wasBlockedBySync = old.deletedAt !== null;
      await deps.store.relinkUser(existing.id, input.tenantId, input.ghlUserId);
      if (wasBlockedBySync) await deps.setDisabled(existing.id, false);
      return { outcome: "restored", userId: existing.id };
    }
    await deps.store.insertLink(input.tenantId, input.ghlUserId, existing.id);
    return { outcome: "linked", userId: existing.id };
  };
  const found = await linkExisting();
  if (found) return found;
  if (input.allowCreate === false) return { outcome: "capped", userId: null };

  let created: { userId: string };
  try {
    created = await deps.createUser({ email, name, password: deps.randomPassword(), role, tenantId: input.tenantId });
  } catch (error) {
    // A webhook and the sync can race: the other one created the user first.
    const raced = await linkExisting();
    if (raced) return raced;
    throw error;
  }
  await deps.store.insertLink(input.tenantId, input.ghlUserId, created.userId);
  try {
    await deps.moves?.markUnused(created.userId, input.tenantId);
  } catch (error) {
    // No marker means the account counts as used: it is never moved, and nothing else changes.
    console.error("Onboarding: unused marker failed:", error instanceof Error ? error.name : "unknown error");
  }
  try {
    await deps.sendSetPassword(email);
  } catch (error) {
    console.error("Onboarding: set-password mail failed:", error instanceof Error ? error.name : "unknown error");
  }
  return { outcome: "created", userId: created.userId };
}

// HighLevel no longer lists this user in the sub-account: block the CRM user and end the sessions.
// Safe to repeat. A user that comes back is restored by provisionGhlUser.
export async function deactivateGhlUser(deps: ProvisionDeps, tenantId: string, ghlUserId: string): Promise<boolean> {
  const link = await deps.store.findLink(tenantId, ghlUserId);
  if (!link || link.deletedAt) return false;
  await deps.store.setLinkDeleted(tenantId, ghlUserId, deps.now());
  await deps.setDisabled(link.userId, true);
  return true;
}
