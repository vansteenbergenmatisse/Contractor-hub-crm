// The one place the scope list lives. Default: the 37 scopes of docs/greenlane/build-prompt.md
// section 14 plus the two media scopes of Settings' Change image (same list for the live and test
// app). `GHL_OAUTH_SCOPES` replaces it without a code
// change. A scope must also be enabled on the Marketplace app, and adding one later needs a new app
// version and re-approval by installed accounts.
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
  "medias.readonly", "medias.write",
] as const;

const SCOPE_PATTERN = /^[a-z0-9][a-z0-9._/-]*$/i;

// The scopes to request: the env override (space, comma or newline separated) or the default list.
export function resolveScopes(override: string | undefined): readonly string[] {
  const entries = (override ?? "").split(/[\s,]+/).filter(Boolean);
  if (entries.length === 0) return OAUTH_SCOPES;
  for (const entry of entries) {
    if (!SCOPE_PATTERN.test(entry)) throw new Error("GHL_OAUTH_SCOPES holds an entry that is not a scope name.");
  }
  return [...new Set(entries)];
}
