import { createHash, randomBytes } from "node:crypto";
import type { EmailSender } from "./email-sender";
import type { InviteEligibility } from "./invite-check";
import { normalizeEmail } from "./invite-check";
import type { InvitedUserInput } from "./auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../types";

// Invite create / preview / accept. Pure logic over injected stores; the database part lives in
// db/invites.ts. The code travels only in the link; the database holds its SHA-256.
const INVITE_LIFETIME_MS = 3 * 24 * 3600 * 1000; // 72 hours: the link is a bearer secret in a URL
const MAX_NAME_LENGTH = 120;

export type InviteErrorCode =
  | "invalid_role"
  | "tenant_unavailable"
  | "not_eligible"
  | "email_taken"
  | "send_failed"
  | "invalid_invite"
  | "weak_password"
  | "invalid_name"
  | "failed";

// Messages are fixed text: they never carry an email, a code or an upstream error.
export class InviteError extends Error {
  constructor(readonly code: InviteErrorCode) {
    super(`Invite error: ${code}`);
    this.name = "InviteError";
  }
}

export type InviteTenant = {
  id: string;
  name: string | null;
  locationId: string;
  companyId: string | null;
  status: "connected" | "needs_reconnect" | "uninstalled";
  // Set while an admin has login turned off for this client: no invite is made or accepted.
  loginDisabledAt?: Date | null;
};

export type InviteRole = "owner" | "office";

export type InviteRecord = {
  id: string;
  tenantId: string;
  email: string;
  role: InviteRole;
  hlUserId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type InviteServiceDeps = {
  now: () => Date;
  newCode: () => string;
  appUrl: string;
  emailSender: EmailSender;
  checkEligibility: (tenant: InviteTenant, email: string) => Promise<InviteEligibility>;
  createUser: (input: InvitedUserInput) => Promise<{ userId: string }>;
  // The HighLevel link of an accepted invite, so the sync can later revoke the account. `insert`
  // never changes a link that already exists.
  links?: {
    find(tenantId: string, ghlUserId: string): Promise<{ userId: string } | null>;
    insert(tenantId: string, ghlUserId: string, userId: string): Promise<void>;
  };
  store: {
    findTenant(tenantId: string): Promise<InviteTenant | null>;
    emailTaken(email: string): Promise<boolean>;
    insertInvite(input: {
      tenantId: string;
      email: string;
      role: InviteRole;
      hlUserId: string;
      codeHash: string;
      expiresAt: Date;
      createdById: string | null;
    }): Promise<{ id: string }>;
    findInviteByCodeHash(hash: string): Promise<InviteRecord | null>;
    // Atomic: true only for the one caller that finds the invite open (unused, not expired).
    claimInvite(id: string, at: Date): Promise<boolean>;
    releaseInvite(id: string): Promise<void>;
    // Removes an invite whose email could not be sent, so no unreachable link stays valid.
    deleteInvite(id: string): Promise<void>;
  };
};

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function newInviteCode(): string {
  return randomBytes(32).toString("base64url");
}

function isOpen(invite: InviteRecord | null, now: Date): invite is InviteRecord {
  return invite !== null && invite.usedAt === null && invite.expiresAt.getTime() > now.getTime();
}

export function createInviteService(deps: InviteServiceDeps) {
  async function createInvite(input: {
    tenantId: string;
    email: string;
    role: InviteRole;
    createdById: string | null;
  }): Promise<{ inviteId: string; link: string; email: string }> {
    if (input.role !== "owner" && input.role !== "office") throw new InviteError("invalid_role");
    const tenant = await deps.store.findTenant(input.tenantId);
    // No company id means HighLevel cannot be asked who belongs to this sub-account.
    if (!tenant || tenant.status !== "connected" || !tenant.companyId || tenant.loginDisabledAt) throw new InviteError("tenant_unavailable");
    const email = normalizeEmail(input.email);
    const eligibility = await deps.checkEligibility(tenant, email);
    if (!eligibility.eligible) throw new InviteError("not_eligible");
    if (await deps.store.emailTaken(email)) throw new InviteError("email_taken");

    const code = deps.newCode();
    const stored = await deps.store.insertInvite({
      tenantId: tenant.id,
      email,
      role: input.role,
      hlUserId: eligibility.hlUserId,
      codeHash: hashInviteCode(code),
      expiresAt: new Date(deps.now().getTime() + INVITE_LIFETIME_MS),
      createdById: input.createdById,
    });
    const link = `${deps.appUrl.replace(/\/+$/, "")}/invite/${code}`;
    try {
      await deps.emailSender.send({
        kind: "invite",
        to: email,
        subject: "You are invited",
        text: `You have been invited. Open this link within 3 days to choose a password:\n${link}`,
      });
    } catch {
      await deps.store.deleteInvite(stored.id).catch(() => {});
      throw new InviteError("send_failed");
    }
    return { inviteId: stored.id, link, email };
  }

  async function previewInvite(code: string): Promise<{ valid: true; email: string } | { valid: false }> {
    const invite = await deps.store.findInviteByCodeHash(hashInviteCode(code));
    if (!isOpen(invite, deps.now())) return { valid: false };
    const tenant = await deps.store.findTenant(invite.tenantId);
    return tenant?.loginDisabledAt ? { valid: false } : { valid: true, email: invite.email };
  }

  async function acceptInvite(input: { code: string; name: string; password: string }): Promise<{ userId: string }> {
    const name = input.name.trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) throw new InviteError("invalid_name");
    if (input.password.length < MIN_PASSWORD_LENGTH || input.password.length > MAX_PASSWORD_LENGTH) {
      throw new InviteError("weak_password");
    }
    const invite = await deps.store.findInviteByCodeHash(hashInviteCode(input.code));
    if (!isOpen(invite, deps.now())) throw new InviteError("invalid_invite");
    // The tenant must still be connected and the email must still be free at accept time.
    const tenant = await deps.store.findTenant(invite.tenantId);
    if (!tenant || tenant.status !== "connected" || !tenant.companyId || tenant.loginDisabledAt) throw new InviteError("invalid_invite");
    if (await deps.store.emailTaken(invite.email)) throw new InviteError("email_taken");
    // The person may have left HighLevel since the invite was made. Checked before the claim, so a
    // refusal or a failed lookup leaves the invite unused.
    let eligibility: InviteEligibility;
    try {
      eligibility = await deps.checkEligibility(tenant, invite.email);
    } catch {
      throw new InviteError("failed");
    }
    if (!eligibility.eligible) throw new InviteError(eligibility.reason === "lookup_failed" ? "failed" : "not_eligible");
    const hlUserId = eligibility.hlUserId;
    // This HighLevel id already belongs to another account: leave that account alone.
    if (deps.links && (await deps.links.find(invite.tenantId, hlUserId))) throw new InviteError("not_eligible");
    // The claim is the single-use gate: only one concurrent caller gets true.
    if (!(await deps.store.claimInvite(invite.id, deps.now()))) throw new InviteError("invalid_invite");
    let created: { userId: string };
    try {
      created = await deps.createUser({
        email: invite.email,
        name,
        password: input.password,
        role: invite.role,
        tenantId: invite.tenantId,
      });
    } catch {
      await deps.store.releaseInvite(invite.id).catch(() => {});
      throw new InviteError("failed");
    }
    try {
      await deps.links?.insert(invite.tenantId, hlUserId, created.userId);
    } catch (error) {
      // The account exists and the invite is spent. The sync links it by email on its next pass.
      console.error("Invite: link not stored:", error instanceof Error ? error.name : "unknown error");
    }
    return created;
  }

  return { createInvite, previewInvite, acceptInvite };
}
