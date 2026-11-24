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

// Every message is shown with a "Try again" button (EmbedBridge) that runs the sign-in again. No
// HighLevel menu path is named: it is not verified for every account.
export const EMBED_DENIAL_MESSAGES: Record<EmbedDenialCode, string> = {
  agency_user:
    "You are signed in with an agency login. This CRM only opens for this business's own team. Ask the business owner to add you as a team member with a different email, then sign in to HighLevel with that login.",
  not_in_location:
    "Your HighLevel user is not part of this business yet. Ask the business owner to add you as a team member in HighLevel, then open CRM again.",
  login_off: "This CRM is turned off for this business. Ask Forge Forward to turn it on.",
  not_connected: "This business is not connected to the CRM yet. Ask Forge Forward to connect it.",
  user_off: "Your access to this CRM is turned off. Ask Forge Forward to turn it back on.",
  account_conflict: "Ask Forge Forward to fix this: your email is already linked to another CRM.",
  other: "We could not sign you in. Tap Try again. If it keeps happening, ask Forge Forward.",
};
