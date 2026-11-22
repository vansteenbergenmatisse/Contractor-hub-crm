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

export type EmbedTenantStatus = "connected" | "needs_reconnect" | "uninstalled";

// What the database knows about the CRM user that matches the payload.
export type EmbedCandidate = {
  userId: string;
  role: string;
  disabledAt: Date | null;
  tenant: { status: EmbedTenantStatus; companyId: string | null };
};
