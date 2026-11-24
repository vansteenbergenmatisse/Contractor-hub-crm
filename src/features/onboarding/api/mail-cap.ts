import { reserveSetPasswordMail } from "../db/sync-state";
import { errorLabel } from "./visit-sync";

// At most this many set-password mails per tenant per UTC day. A proposal, not a measured number.
export const MAX_SET_PASSWORD_MAILS_PER_TENANT_PER_DAY = 50;

export type MailCapDeps = {
  now(): Date;
  // ONBOARDING_SEND_SET_PASSWORD is on. While it is off no mail goes out, so no budget is spent.
  gateOpen(): boolean;
  // Left out: the real budget in TenantSyncState (so callers outside this feature, such as the admin's
  // "Send sign-in email" route, share the same per-client daily count).
  reserve?(tenantId: string, day: Date, cap: number): Promise<boolean>;
  // True: a budget that cannot be read rejects with MailBudgetUnreadableError (the mail is still not
  // sent), so the caller can say "email status unknown" instead of "limit reached".
  failWhenUnreadable?: boolean;
};

export class MailBudgetUnreadableError extends Error {
  constructor() {
    super("The client's daily mail budget could not be read.");
    this.name = "MailBudgetUnreadableError";
  }
}

// Wraps the set-password send. Over the cap, or when the budget cannot be read, the mail is skipped
// and the account stays. The mail is NOT retried later: that person sets a password through
// "forgot password".
export function createMailCap(input: MailCapDeps) {
  const deps = { ...input, reserve: input.reserve ?? reserveSetPasswordMail };
  let skipped = 0;
  return {
    async send(tenantId: string, send: () => Promise<void>): Promise<void> {
      if (!deps.gateOpen()) return send();
      const now = deps.now();
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      let allowed = false;
      try {
        allowed = await deps.reserve(tenantId, day, MAX_SET_PASSWORD_MAILS_PER_TENANT_PER_DAY);
      } catch (error) {
        skipped += 1;
        console.error(`Onboarding: set-password mail skipped, budget step failed: ${errorLabel(error)} skipped=${skipped}`);
        if (deps.failWhenUnreadable) throw new MailBudgetUnreadableError();
        return;
      }
      if (allowed) return send();
      skipped += 1;
      console.warn(`Onboarding: set-password mail over the daily cap, skipped=${skipped}`);
    },
  };
}

// The budget for the links an admin issues ("Send sign-in email", and "Invite owner" on an email that
// already has a never-used account): the same per-client daily count as the sync's mails, counted
// whatever ONBOARDING_SEND_SET_PASSWORD says. It resolves without sending when the cap is reached, and
// rejects when the budget cannot be read. Pass it as the sign-in link service's `mailBudget`.
export function createSignInMailBudget(input: Pick<MailCapDeps, "now" | "reserve"> = { now: () => new Date() }) {
  const cap = createMailCap({ ...input, gateOpen: () => true, failWhenUnreadable: true });
  return (tenantId: string, send: () => Promise<void>): Promise<void> => cap.send(tenantId, send);
}
