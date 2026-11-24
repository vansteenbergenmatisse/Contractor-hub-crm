import type { ClientRow, LoginState, TenantStatusValue } from "../types";

const LABELS: Record<TenantStatusValue, string> = {
  connected: "Connected",
  needs_reconnect: "Needs reconnect",
  uninstalled: "Uninstalled",
};

export const statusLabel = (status: TenantStatusValue): string => LABELS[status];

// `loginOff` is the TenantLoginLock state and decides the row whenever it is known. Blocked users
// do not make a client off: they may be people HighLevel removed. Only a caller that did not read
// the lock (undefined) falls back to the user counts.
export function loginState(users: number, activeUsers: number, loginOff?: boolean): LoginState {
  if (loginOff) return "off";
  if (users === 0) return "no users";
  if (loginOff === false) return "on";
  return activeUsers > 0 ? "on" : "off";
}

export function toClientRow(
  tenant: { id: string; name: string | null; locationId: string; status: TenantStatusValue; loginDisabledAt?: Date | null },
  users: number,
  activeUsers: number,
): ClientRow {
  return {
    tenantId: tenant.id,
    name: tenant.name ?? tenant.locationId,
    status: statusLabel(tenant.status),
    login: loginState(users, activeUsers, tenant.loginDisabledAt === undefined ? undefined : tenant.loginDisabledAt !== null),
    users,
  };
}
