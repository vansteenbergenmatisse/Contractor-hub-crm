const INVITE_ERRORS: Record<string, string> = {
  email_taken: "This email already has an account.",
  // The server uses this code for a bad email, a non-user and a failed HighLevel lookup alike.
  not_eligible: "We could not confirm this email as a user of this client. Check it and try again.",
  tenant_unavailable: "This client is not connected. Reconnect it first.",
  send_failed: "The invite could not be sent. Try again.",
  rate_limited: "Too many invites. Wait a minute and try again.",
  forbidden: "You do not have permission to do this. Sign in again.",
  invalid_request: "Enter a valid email.",
};

export const INVITE_FALLBACK = "The invite was not created. Try again.";

export function inviteErrorMessage(code: unknown): string {
  return typeof code === "string" && Object.hasOwn(INVITE_ERRORS, code) ? INVITE_ERRORS[code] : INVITE_FALLBACK;
}
