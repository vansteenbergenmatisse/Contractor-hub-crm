// Public API of the alerts feature. Other code imports from "@/features/alerts" only.
// Internal Slack alerts for failed sends. Not wired to any send yet.
export { createFailedSendAlerter, createFailedSendAlerterFromEnv, getFailedSendAlerter } from "./api/failed-send-alert";
export { ALERT_CATEGORIES, ALERT_CHANNELS } from "./types";
export type { AlertCategory, AlertChannel, AlertResult, FailedSendAlert, FailedSendAlerter } from "./types";
