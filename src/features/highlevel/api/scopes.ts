// The 37 scopes of docs/greenlane/build-prompt.md section 14 (same list for the live and test app).
// Adding one later needs a new app version and re-approval by installed accounts.
export const OAUTH_SCOPES = [
  "oauth.readonly", "oauth.write", "locations.readonly", "locations/customValues.readonly",
  "locations/customValues.write", "locations/tags.readonly", "locations/customFields.readonly",
  "users.readonly", "contacts.readonly", "contacts.write", "opportunities.readonly",
  "opportunities.write", "pipelines.readonly", "calendars.readonly", "calendars.write",
  "calendars/events.readonly", "calendars/events.write", "calendars/groups.readonly",
  "calendars/groups.write", "calendars/resources.readonly", "calendars/resources.write",
  "conversations.readonly", "conversations.write", "conversations/message.readonly",
  "conversations/message.write", "invoices.readonly", "invoices.write",
  "invoices/estimate.readonly", "invoices/estimate.write", "payments/transactions.readonly",
  "workflows.readonly", "workflows.write", "workflows.delete", "workflows.publish",
  "workflows.logs", "phonenumbers.read", "socialplanner/account.readonly",
] as const;
