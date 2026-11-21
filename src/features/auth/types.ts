// Types shared inside the auth feature.

// Roles of the CRM: owner and office belong to one tenant; admin is Forge Forward staff.
export const ROLES = ["owner", "office", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// One source for the client hints and the server rule (api/auth.ts, api/invites.ts).
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
