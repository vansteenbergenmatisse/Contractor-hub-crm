export const ALERT_CHANNELS = ["text", "email", "facebook", "instagram", "other"] as const;
export const ALERT_CATEGORIES = [
  "provider_rejected",
  "rate_limited",
  "timeout",
  "network",
  "auth",
  "invalid_recipient",
  "unknown",
] as const;

export type AlertChannel = (typeof ALERT_CHANNELS)[number];
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

// Everything an alert may carry. Never add a name, phone, email or message text here.
export type FailedSendAlert = {
  tenantId: string; // internal Tenant id (cuid)
  channel: AlertChannel;
  category: AlertCategory;
  count: number;
  correlationId: string; // UUID
};

export type AlertResult = { status: "sent" | "throttled" | "disabled" | "invalid" | "failed" };

export type FailedSendAlerter = {
  // Never throws and never rejects: an alert problem must not affect the send that failed.
  alert(input: FailedSendAlert): Promise<AlertResult>;
  trackedKeys(): number;
};
