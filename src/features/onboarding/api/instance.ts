import { after } from "next/server";
import { createEmailSenderFromEnv, deactivateGhlUser, getProvisionDeps, listActiveLinks, provisionGhlUser } from "@/features/auth";
import { getBrandService } from "@/features/brand";
import { getOnboardingApi, type OAuthCallbackDeps, type WebhookHooks } from "@/features/highlevel";
import { claimAlerts, releaseAlerts } from "../db/alerts";
import { claimVisitSync, reserveSetPasswordMail } from "../db/sync-state";
import { createWebhookHooks } from "./hooks";
import { createMailCap } from "./mail-cap";
import { onboardLocation, type OnboardDeps } from "./onboard";
import { handleSync, runSync, type SyncDeps } from "./sync";
import { syncTenantUsers, type UserSyncDeps } from "./users";
import { deferVisitSync, runVisitSync, syncUsersOnVisit } from "./visit-sync";

// The real wiring: HighLevel API + token store, auth provisioning, the database. Built per call
// (cheap); a missing env throws, and callers treat that as "not configured".
function build() {
  const hl = getOnboardingApi();
  const provisionDeps = getProvisionDeps();
  const mailCap = createMailCap({
    now: () => new Date(),
    gateOpen: () => process.env.ONBOARDING_SEND_SET_PASSWORD?.trim() === "true",
    reserve: reserveSetPasswordMail,
  });
  const userSync: UserSyncDeps = {
    provision: (input) =>
      provisionGhlUser(
        { ...provisionDeps, sendSetPassword: (email) => mailCap.send(input.tenantId, () => provisionDeps.sendSetPassword(email)) },
        input,
      ),
    deactivate: (tenantId, ghlUserId) => deactivateGhlUser(provisionDeps, tenantId, ghlUserId),
    activeLinks: listActiveLinks,
  };
  const onboardDeps: OnboardDeps = {
    ...userSync,
    async connect({ companyId, locationId, name }) {
      const agency = await hl.agency(companyId);
      if (!agency) throw new Error("No usable agency token.");
      return agency.connect(locationId, name);
    },
    listUsers: hl.usersWithToken,
  };
  return { hl, userSync, onboardDeps };
}

// Passed to the OAuth callback route: runs the onboarding sync instead of the bare token loop.
export function getCallbackOnboard(): OAuthCallbackDeps["onboard"] {
  const { hl, userSync, onboardDeps } = build();
  return {
    async agencyLocations({ companyId, locations }) {
      let installed = 0;
      let failed = 0;
      for (const location of locations) {
        try {
          await onboardLocation(onboardDeps, { companyId, locationId: location.locationId, name: location.name });
          installed += 1;
        } catch (error) {
          failed += 1;
          console.error(`Onboarding: location step failed: ${error instanceof Error ? error.name : "unknown error"}`);
        }
      }
      return { installed, failed };
    },
    async singleLocation(input) {
      if (!input.companyId) throw new Error("A Location token without a companyId cannot be onboarded.");
      const saved = await hl.saveLocationToken({
        locationId: input.locationId,
        companyId: input.companyId,
        name: null,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
      });
      const users = await hl.usersWithToken(input.accessToken, input.companyId, input.locationId);
      await syncTenantUsers(userSync, saved.tenantId, users);
      return { installed: 1, failed: 0 };
    },
  };
}

// Passed to the webhook route: what happens after INSTALL and on location and user events.
export function getWebhookHooks(): WebhookHooks | undefined {
  let built: ReturnType<typeof build>;
  try {
    built = build();
  } catch (error) {
    console.error(`Onboarding hooks not available: ${error instanceof Error ? error.message : "invalid env"}`);
    return undefined;
  }
  const { hl, userSync } = built;
  // Per server instance: other instances drop their cached brand only when its TTL runs out.
  return createWebhookHooks({ hl, userSync, invalidateBrand: (tenantId) => getBrandService().invalidate(tenantId) });
}

// Called while a signed-in tenant page renders, with the tenant from the session. All the work
// (claim, HighLevel read, user sync) runs after the response. Same caps and mail gate as the webhooks
// and the cron, but this path never blocks a user.
export function scheduleVisitSync(tenantId: string): void {
  deferVisitSync(after, () =>
    runVisitSync(
      {
        now: () => new Date(),
        claim: claimVisitSync,
        syncUsers: async (id) => {
          const { hl, userSync } = build();
          return syncUsersOnVisit(userSync, id, await hl.usersOfTenant(id));
        },
      },
      tenantId,
    ),
  );
}

// POST or GET /api/integrations/sync.
export async function syncRoute(request: Request): Promise<Response> {
  return handleSync(request, {
    cronSecret: process.env.CRON_SECRET?.trim() || undefined,
    run: async () => {
      const { hl, userSync, onboardDeps } = build();
      const sender = createEmailSenderFromEnv();
      const appUrl = process.env.APP_URL?.trim() ?? "";
      const deps: SyncDeps = {
        now: () => new Date(),
        companyIds: hl.companyIds,
        agency: hl.agency,
        connectedTenants: hl.connectedTenants,
        onboard: (input) => onboardLocation(onboardDeps, input),
        resyncUsers: async (tenantId) => syncTenantUsers(userSync, tenantId, await hl.usersOfTenant(tenantId)),
        claimAlerts,
        releaseAlerts,
        adminEmail: process.env.ADMIN_ALERT_EMAIL?.trim() || null,
        installLink: `${appUrl}/api/integrations/oauth/start`,
        send: (message) => sender.send(message),
      };
      return runSync(deps);
    },
  });
}
