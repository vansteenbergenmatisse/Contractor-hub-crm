// Why the CRM inside HighLevel did not sign someone in, as a short public code. The server sends it
// in a response header on its 403 (never an email, an id or the payload); the /embed page shows the
// matching message. Each message names the one thing that fixes it, and says "ask Forge Forward" only
// where Forge Forward is the fix (the CRM or this user turned off, the business not connected).
export const EMBED_DENIAL_HEADER = "x-embed-denied";

export const EMBED_DENIAL_CODES = [
  "agency_user",
  "not_in_location",
  "login_off",
  "not_connected",
  "user_off",
  "account_conflict",
  "other",
] as const;

export type EmbedDenialCode = (typeof EMBED_DENIAL_CODES)[number];

export const isEmbedDenialCode = (value: unknown): value is EmbedDenialCode =>
  typeof value === "string" && (EMBED_DENIAL_CODES as readonly string[]).includes(value);

export const EMBED_DENIAL_MESSAGES: Record<EmbedDenialCode, string> = {
  agency_user:
    "You are signed in to HighLevel with an agency login. This CRM opens only for this business's own users. Sign in to HighLevel as a user of this business (Settings > My Staff), then open CRM again.",
  not_in_location:
    "Your HighLevel user is not part of this business yet. Ask the business owner to add you under Settings > My Staff, then open CRM again.",
  login_off: "This CRM is turned off for this business. Ask Forge Forward to turn it on.",
  not_connected: "This CRM is turned off for this business. Ask Forge Forward to turn it on.",
  user_off: "Your access to this CRM is turned off. Ask Forge Forward to turn it back on.",
  account_conflict:
    "This email is already used for another business's CRM. Use a different HighLevel user for this business, or ask Forge Forward.",
  other: "We could not sign you in. Reload this page. If it keeps happening, ask Forge Forward.",
};
