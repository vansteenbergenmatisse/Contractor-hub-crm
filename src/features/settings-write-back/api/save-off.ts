// What Settings says when a save cannot reach this client's HighLevel, so Save never pretends.
export const SAVE_OFF_FOR_OWNER = "Saving to HighLevel is turned off for this business. Ask Forge Forward to turn it on.";
export const SAVE_OFF_FOR_OFFICE = "Only the owner can change these details.";

export function saveOffReason(role: string | undefined): string {
  return role === "office" ? SAVE_OFF_FOR_OFFICE : SAVE_OFF_FOR_OWNER;
}
