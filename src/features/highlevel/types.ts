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
