import type { EmailSender } from "./email-sender";
import type { InviteEligibility } from "./invite-check";
import { normalizeEmail } from "./invite-check";
import { InviteError, type InviteTenant } from "./invites";
import { judgeUnused, type AccountSnapshot } from "./account-move";
import { SET_PASSWORD_LINK_HOURS, setPasswordEmail } from "./set-password-email";
import type { Role } from "../types";

// A fresh "choose your password" link for an account the onboarding sync created in a tenant, for an
// admin to send (and copy). Only for an account PROVEN never used (docs/onboarding.md decision 3:
// a marker from its first random password, no session, password unchanged). Anyone who has signed in,
// or whose account cannot be proven unused, uses Forgot password: an admin never gets a working link
// into an account somebody already uses.

// What an admin sees per person: whether a sign-in link may be sent.
export type AccountState = "never_signed_in" | "signed_in" | "login_off" | "unproven";

export type TenantAccount = {
  userId: string;
  name: string;
  email: string;
  role: Extract<Role, "owner" | "office">;
  state: AccountState;
};

// "held": the email guard kept the mail back (log mode, or allowlist and the address is not listed).
// "capped": the client's daily budget of these mails is used up. "failed": the provider refused it.
export type MailOutcome = "sent" | "held" | "capped" | "failed";

export type SignInLinkResult = { userId: string; email: string; link: string; expiresAt: Date; mail: MailOutcome };

export type AccountRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
};

export type SignInLinkDeps = {
  now: () => Date;
  appUrl: string;
  emailSender: EmailSender;
  checkEligibility: (tenant: InviteTenant, email: string) => Promise<InviteEligibility>;
  newToken: () => string;
  // Runs `send` only when the client's daily mail budget allows it (the onboarding mail cap). Left out,
  // the mail is not counted.
  mailBudget?: (tenantId: string, send: () => Promise<void>) => Promise<void>;
  store: {
    findTenant(tenantId: string): Promise<InviteTenant | null>;
    findUserByEmail(email: string): Promise<AccountRow | null>;
    findUserById(userId: string): Promise<AccountRow | null>;
    readSnapshot(userId: string): Promise<AccountSnapshot | null>;
    listTenantAccounts(tenantId: string): Promise<Array<AccountRow & { snapshot: AccountSnapshot }>>;
    // Removes the person's older set-password links, then stores the new one (Better Auth's format).
    replaceResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  };
};

export function accountState(snapshot: AccountSnapshot | null, tenantId: string): AccountState {
  if (!snapshot) return "unproven";
  const reason = judgeUnused(snapshot, tenantId);
  if (reason === null) return "never_signed_in";
  if (reason === "disabled") return "login_off";
  if (reason === "used") return "signed_in";
  return "unproven";
}

const usable = (tenant: InviteTenant | null): tenant is InviteTenant =>
  tenant !== null && tenant.status === "connected" && !!tenant.companyId && !tenant.loginDisabledAt;

const isClientRole = (role: Role): role is "owner" | "office" => role === "owner" || role === "office";

export function createSignInLinkService(deps: SignInLinkDeps) {
  // The account is in this tenant; HighLevel was already asked (the caller did it).
  async function issue(tenant: InviteTenant, user: AccountRow): Promise<SignInLinkResult> {
    const state = accountState(await deps.store.readSnapshot(user.id), tenant.id);
    if (state === "login_off") throw new InviteError("account_disabled");
    if (state !== "never_signed_in") throw new InviteError("already_active");

    const token = deps.newToken();
    const expiresAt = new Date(deps.now().getTime() + SET_PASSWORD_LINK_HOURS * 3600_000);
    await deps.store.replaceResetToken(user.id, token, expiresAt);
    const link = `${deps.appUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

    const message = setPasswordEmail({ to: user.email, tenantName: tenant.name, link, appUrl: deps.appUrl, expiresAt });
    let mail: MailOutcome = "capped";
    const send = async () => {
      try {
        mail = (await deps.emailSender.send(message)).delivered ? "sent" : "held";
      } catch {
        mail = "failed"; // the link is stored and shown, so the admin can still pass it on
      }
    };
    if (deps.mailBudget) {
      await deps.mailBudget(tenant.id, send).catch(() => {});
    } else {
      await send();
    }
    return { userId: user.id, email: user.email, link, expiresAt, mail };
  }

  // "Invite owner" for an email that already has an account. Another tenant's account (or an admin)
  // stays refused as email_taken. HighLevel has already confirmed the email for this tenant.
  async function issueForEmail(tenant: InviteTenant, email: string): Promise<SignInLinkResult> {
    const user = await deps.store.findUserByEmail(normalizeEmail(email));
    if (!user || user.tenantId !== tenant.id || !isClientRole(user.role)) throw new InviteError("email_taken");
    return issue(tenant, user);
  }

  // The per-person "Send sign-in email" on /admin/clients.
  async function sendForUser(input: { tenantId: string; userId: string }): Promise<SignInLinkResult> {
    const tenant = await deps.store.findTenant(input.tenantId);
    if (!usable(tenant)) throw new InviteError("tenant_unavailable");
    const user = await deps.store.findUserById(input.userId);
    // Another tenant's user answers exactly like a missing one.
    if (!user || user.tenantId !== tenant.id || !isClientRole(user.role)) throw new InviteError("not_found");
    let eligibility: InviteEligibility;
    try {
      eligibility = await deps.checkEligibility(tenant, user.email);
    } catch {
      throw new InviteError("failed");
    }
    // The person must still be a live HighLevel user of this sub-account.
    if (!eligibility.eligible) throw new InviteError(eligibility.reason === "lookup_failed" ? "failed" : "not_eligible");
    return issue(tenant, user);
  }

  async function listAccounts(tenantId: string): Promise<TenantAccount[]> {
    const tenant = await deps.store.findTenant(tenantId);
    if (!tenant) throw new InviteError("not_found");
    const rows = await deps.store.listTenantAccounts(tenantId);
    return rows
      .filter((row): row is typeof row & { role: "owner" | "office" } => isClientRole(row.role) && row.tenantId === tenantId)
      .map((row) => ({ userId: row.id, name: row.name, email: row.email, role: row.role, state: accountState(row.snapshot, tenantId) }));
  }

  return { issueForEmail, sendForUser, listAccounts };
}

export type SignInLinkService = ReturnType<typeof createSignInLinkService>;
