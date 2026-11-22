import type { OnboardingApi, WebhookHooks } from "@/features/highlevel";
import { syncTenantUsers, type UserSyncDeps } from "./users";

export type WebhookHookDeps = {
  hl: Pick<OnboardingApi, "findTenant" | "renameTenant" | "usersOfTenant" | "usersWithToken">;
  userSync: UserSyncDeps;
  // Drops the tenant's cached brand and custom values. The cache lives in ONE server instance's
  // memory, so this only refreshes the instance that received the webhook; other instances keep
  // their copy until its TTL (5 minutes) runs out.
  invalidateBrand(tenantId: string): void;
};

// What happens after INSTALL and on location and user events. The handler only calls these after
// the webhook's signature is verified, and the tenant is always looked up from the event's location
// in our own database, never taken from the payload.
export function createWebhookHooks(deps: WebhookHookDeps): WebhookHooks {
  const { hl, userSync } = deps;
  return {
    async onLocationConnected({ tenantId, companyId, locationId, accessToken }) {
      const users = await hl.usersWithToken(accessToken, companyId, locationId);
      const counts = await syncTenantUsers(userSync, tenantId, users);
      console.info(`Onboarding: INSTALL users created=${counts.created} linked=${counts.linked} failed=${counts.failed}`);
    },
    async onLocationUpdate({ locationId, name }) {
      const tenant = await hl.findTenant(locationId);
      if (!tenant) return;
      // Custom values (the brand source) may have changed: invalidate before the rename, so a failed
      // rename never leaves old branding cached.
      try {
        deps.invalidateBrand(tenant.tenantId);
      } catch (error) {
        console.error(`Onboarding: brand invalidation failed: ${error instanceof Error ? error.name : "unknown error"}`);
      }
      if (name) await hl.renameTenant(locationId, name);
    },
    async onUserEvent({ type, locationId }) {
      const tenant = await hl.findTenant(locationId);
      if (!tenant || tenant.status !== "connected") return;
      const counts = await syncTenantUsers(userSync, tenant.tenantId, await hl.usersOfTenant(tenant.tenantId));
      console.info(`Onboarding: ${type} users created=${counts.created} deactivated=${counts.deactivated} failed=${counts.failed}`);
    },
  };
}
