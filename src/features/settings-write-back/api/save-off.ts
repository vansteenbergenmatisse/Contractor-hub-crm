// What Settings says when a save cannot reach this client's HighLevel, so Save never pretends.
export const SAVE_OFF_FOR_OWNER = "Saving to HighLevel is turned off for this business. Ask Forge Forward to turn it on.";
export const SAVE_OFF_FOR_OFFICE = "Only the owner can change these details.";
export const SAVE_OFF_NOT_CONNECTED = "This account is not connected to a business in HighLevel yet, so nothing can be saved.";
export const SAVE_OFF_NOT_OWNER = "Only the business owner can save these details.";

// `connected`: the user has a tenant. Without one, no flag could turn saving on.
export function saveOffReason(role: string | undefined, connected = true): string {
  if (!connected) return SAVE_OFF_NOT_CONNECTED;
  if (role === "owner") return SAVE_OFF_FOR_OWNER;
  if (role === "office") return SAVE_OFF_FOR_OFFICE;
  return SAVE_OFF_NOT_OWNER;
}
