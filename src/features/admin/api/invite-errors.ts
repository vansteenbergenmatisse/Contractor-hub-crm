const INVITE_ERRORS: Record<string, string> = {
  // An account of the same client that was never used gets a set-password link instead, so this
  // code now means: the account belongs to another client (or to Forge Forward staff).
  email_taken: "This email already has an account in another client. Nothing was sent.",
  // The server uses this code for a bad email, a non-user and a failed HighLevel lookup alike.
  not_eligible: "We could not confirm this email as a user of this client. Check it and try again.",
  tenant_unavailable: "This client is not connected. Reconnect it first.",
  send_failed: "The invite could not be sent. Try again.",
  rate_limited: "Too many invites. Wait a minute and try again.",
  forbidden: "You do not have permission to do this. Sign in again.",
  invalid_request: "Enter a valid email.",
  already_active:
    "This person already has an account they have used, so no link is shown. Ask them to choose \"Forgot password\" on the sign-in page.",
  account_disabled: "This person's login is turned off, or HighLevel removed them. Nothing was sent.",
  not_found: "This person is no longer a user of this client. Reload the page.",
};

export const INVITE_FALLBACK = "The invite was not created. Try again.";
export const SIGN_IN_EMAIL_FALLBACK = "No sign-in link was made. Try again.";

export function inviteErrorMessage(code: unknown, fallback: string = INVITE_FALLBACK): string {
  return typeof code === "string" && Object.hasOwn(INVITE_ERRORS, code) ? INVITE_ERRORS[code] : fallback;
}
