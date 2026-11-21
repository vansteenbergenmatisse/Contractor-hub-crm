import type { ClientRow, LoginState, TenantStatusValue } from "../types";

const LABELS: Record<TenantStatusValue, string> = {
  connected: "Connected",
  needs_reconnect: "Needs reconnect",
  uninstalled: "Uninstalled",
};

export const statusLabel = (status: TenantStatusValue): string => LABELS[status];

export function loginState(users: number, activeUsers: number): LoginState {
  if (users === 0) return "no users";
  return activeUsers > 0 ? "on" : "off";
}

export function toClientRow(
  tenant: { id: string; name: string | null; locationId: string; status: TenantStatusValue },
  users: number,
  activeUsers: number,
): ClientRow {
  return {
    tenantId: tenant.id,
    name: tenant.name ?? tenant.locationId,
    status: statusLabel(tenant.status),
    login: loginState(users, activeUsers),
    users,
  };
}
