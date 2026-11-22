// Types shared inside the highlevel feature.
export type AgencyToken = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  companyId: string;
};

export type LocationToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  locationId: string;
};

export type RefreshedToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
};

export type InstalledLocation = { locationId: string; name: string | null };

// One custom value of a sub-account: `key` is the part of fieldKey after "custom_values.".
export type CustomValue = { key: string; value: string };

export type SearchUsersQuery = { companyId: string; locationId: string; query: string };

// A HighLevel user as the invite check needs it (GET /users/search). roleType is "account" or
// "agency" and role "admin" or "user" per the docs; null when HighLevel omits them.
export type HighLevelUser = {
  id: string;
  email: string;
  name: string | null;
  deleted: boolean;
  roleType: string | null;
  role: string | null;
  locationIds: string[];
};

export type HighLevelClientConfig = {
  appId: string;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
};

export type SaveAgencyConnectionInput = {
  companyId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export type SaveLocationConnectionInput = {
  locationId: string;
  companyId: string;
  name: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
};

export type OAuthStartConfig = {
  installBaseUrl: string;
  clientId: string;
  redirectUri: string;
  // Draft app version id (`GHL_APP_VERSION_ID`); left out of the URL when empty.
  versionId?: string;
  // Replaces the default scope list (`GHL_OAUTH_SCOPES`).
  scopes?: readonly string[];
};

export type WebhookEventInput = {
  webhookId: string;
  type: string;
  locationId: string | null;
  companyId: string | null;
  payload: unknown;
};

export type LocationState = {
  tenantId: string;
  locationId: string;
  companyId: string | null;
  status: "connected" | "needs_reconnect" | "uninstalled";
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
};

export type AgencyState = {
  companyId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

// What the token service decides while it holds the row lock. `refreshToken` left out means "keep the
// stored one"; null clears it (a re-mint that came with no refresh token).
export type LocationDecision =
  | { kind: "keep" }
  | { kind: "save"; accessToken: string; refreshToken?: string | null; expiresAt: Date }
  | { kind: "reconnect" };

export type AgencyDecision =
  | { kind: "keep" }
  | { kind: "save"; accessToken: string; refreshToken: string; expiresAt: Date };

// What a code exchange can return: an agency (Company) token, or, for a single sub-account install,
// a Location token. Anything else is refused.
export type OAuthCodeResult =
  | { kind: "company"; accessToken: string; refreshToken: string; expiresInSeconds: number; companyId: string }
  | {
      kind: "location";
      accessToken: string;
      refreshToken: string | null;
      expiresInSeconds: number;
      locationId: string;
      companyId: string | null;
    };

// A sub-account as the agency's location search lists it.
export type AgencyLocation = { locationId: string; name: string | null; email: string | null };
