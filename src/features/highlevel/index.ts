// Public API of the highlevel feature. Other code imports from "@/features/highlevel" only.
export { createHighLevelClient, HighLevelHttpError, isRejectedByHighLevel } from "./api/client";
export { describeError, logError, redact } from "./api/log-error";
export { OAUTH_SCOPES, resolveScopes } from "./api/scopes";
export { createTokenService, TokenServiceError } from "./api/token-service";
export type { TokenServiceDeps, TokenServiceErrorCode } from "./api/token-service";
export { handleOAuthStart } from "./api/start";
export type { OAuthStartDeps } from "./api/start";
export { handleOAuthCallback } from "./api/callback";
export type { OAuthCallbackDeps } from "./api/callback";
export {
  createTenantContactsReader,
  createWebhookRoute,
  getOnboardingApi,
  getTokenService,
  listTenantCustomValues,
  listTenantUsers,
  oauthCallbackRoute,
  oauthStartRoute,
  readTenantContacts,
  readTenantCustomValuesStored,
  searchLocationUsers,
  webhookRoute,
} from "./api/routes";
export type { AdminGuard, OnboardingApi } from "./api/routes";
export { withStoredLocationToken } from "./api/stored-token";
export { handleWebhook } from "./api/webhook";
export type { WebhookDeps, WebhookHooks } from "./api/webhook";
export { HIGHLEVEL_WEBHOOK_PUBLIC_KEY, verifyWebhookSignature } from "./api/webhook-signature";
export {
  deleteAgencyConnection,
  markLocationUninstalled,
  readAgencyAccessToken,
  readLocationCompanyId,
  saveAgencyConnection,
  saveLocationConnection,
} from "./db/connections";
export {
  readAgencyState,
  readLocationState,
  updateAgencyLocked,
  updateLocationLocked,
} from "./db/token-store";
export { beginWebhookEvent, markWebhookProcessed } from "./db/webhook-events";
export type {
  AgencyDecision,
  AgencyLocation,
  CustomValue,
  AgencyState,
  AgencyToken,
  ContactsPage,
  ContactsRead,
  HighLevelClientConfig,
  HighLevelContact,
  HighLevelUser,
  InstalledLocation,
  LocationDecision,
  LocationState,
  LocationToken,
  OAuthStartConfig,
  RefreshedToken,
  SaveAgencyConnectionInput,
  SaveLocationConnectionInput,
  SearchUsersQuery,
  WebhookEventInput,
} from "./types";
export { searchUsersWithRetry } from "./api/search-users";
export { listCustomValuesWithRetry } from "./api/custom-values";
export {
  CONTACTS_PAGE_SIZE,
  CONTACTS_READS_PER_MINUTE,
  MAX_CONTACTS_RESPONSE_BYTES,
  parseContactSearch,
  readContactsPage,
  readContactsThrottled,
} from "./api/contacts";
export {
  INBOX_CONVERSATIONS_LIMIT,
  INBOX_MESSAGES_LIMIT,
  INBOX_READS_PER_MINUTE,
  MAX_INBOX_RESPONSE_BYTES,
  buildInboxReader,
  createTenantInboxReader,
  parseConversationMessages,
  parseConversationSearch,
  readInboxConversations,
  readInboxThread,
  requestConversationMessages,
  requestConversationSearch,
  type ConversationsPage,
  type ConversationsRead,
  type HighLevelConversation,
  type HighLevelMessage,
  type InboxAdapter,
  type InboxViewer,
  type MessagesPage,
  type MessagesRead,
} from "./api/conversations";
