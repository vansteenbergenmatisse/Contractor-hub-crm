import type { HighLevelUser } from "@/features/highlevel";
import { syncTenantUsers, type UserSyncDeps } from "./users";
import type { UserCounts } from "../types";

export type OnboardDeps = UserSyncDeps & {
  // Mints and saves the location token and the tenant; returns the token so the users can be listed.
  // `listedAt`: when the installed list that named this location was read (the sync passes it), so a
  // location uninstalled after that moment is not revived.
  connect(input: { companyId: string; locationId: string; name: string | null; listedAt?: Date }): Promise<{ tenantId: string; accessToken: string }>;
  listUsers(accessToken: string, companyId: string, locationId: string): Promise<HighLevelUser[]>;
};

// Onboard one location (INSTALL webhook, OAuth callback and the sync all use this): location token,
// tenant, then a CRM user for every HighLevel user, each new user getting a "set your password"
// mail. Safe to repeat. Returns the tenant and what happened to the users.
export async function onboardLocation(
  deps: OnboardDeps,
  input: { companyId: string; locationId: string; name: string | null; listedAt?: Date },
): Promise<{ tenantId: string; users: UserCounts }> {
  const { tenantId, accessToken } = await deps.connect(input);
  const users = await deps.listUsers(accessToken, input.companyId, input.locationId);
  return { tenantId, users: await syncTenantUsers(deps, tenantId, users) };
}
