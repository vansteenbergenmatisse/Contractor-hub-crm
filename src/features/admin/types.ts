// Types shared inside the admin feature.
export type TenantStatusValue = "connected" | "needs_reconnect" | "uninstalled";
export type LoginState = "on" | "off" | "no users";
export type ClientRow = { tenantId: string; name: string; status: string; login: LoginState; users: number };
