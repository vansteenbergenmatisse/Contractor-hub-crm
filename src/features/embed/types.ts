// Types shared inside the embed feature.
export type EmbedErrorCode = "invalid_payload" | "no_location";

// The part of HighLevel's decrypted user context that the CRM uses. Unknown keys are dropped.
export type UserContext = {
  email: string; // trimmed, lower case
  activeLocation: string; // the sub-account the user is working in
  userId?: string;
  companyId?: string;
  role?: string;
  type?: string;
};

// The tenant of a sub-account, whether or not the user has an account yet.
export type EmbedTenant = { tenantId: string; status: EmbedTenantStatus; companyId: string | null };

// What the embed sign-in decides: an existing CRM user, a user to create on the spot (the caller must
// still confirm with HighLevel that the person belongs to the sub-account), or a denial with a short
// reason code for the log (never shown to the browser).
export type EmbedAccess =
  | { kind: "user"; userId: string }
  | { kind: "provision"; tenantId: string }
  | { kind: "denied"; reason: string };

export type EmbedTenantStatus = "connected" | "needs_reconnect" | "uninstalled";

// What the database knows about the CRM user that matches the payload.
export type EmbedCandidate = {
  userId: string;
  role: string;
  disabledAt: Date | null;
  tenant: { status: EmbedTenantStatus; companyId: string | null };
};
