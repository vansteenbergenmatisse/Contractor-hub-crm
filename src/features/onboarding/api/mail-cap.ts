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
};

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
        return;
      }
      if (allowed) return send();
      skipped += 1;
      console.warn(`Onboarding: set-password mail over the daily cap, skipped=${skipped}`);
    },
  };
}
