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
