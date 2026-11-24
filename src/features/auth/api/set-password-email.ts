import type { EmailMessage } from "./email-sender";

// The "choose your password" mail. One text for every path that sends it: the admin's "Send sign-in
// email", "Invite owner" for an account the sync already made, Forgot password and the onboarding
// sync. Plain text: which business, the link, when it expires, and where to sign in afterwards.
export const SET_PASSWORD_LINK_HOURS = 24;

const MAX_NAME_LENGTH = 80;

// A business name comes from HighLevel (the client's own admin types it). No control characters and
// no line breaks in a subject; long names are cut.
export function cleanBusinessName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const cleaned = name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;
  return cleaned.length > MAX_NAME_LENGTH ? `${cleaned.slice(0, MAX_NAME_LENGTH - 3)}...` : cleaned;
}

// "2026-11-25 14:00 UTC": the same for every reader, whatever their time zone.
export function formatUtc(at: Date): string {
  return `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function signInUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/sign-in`;
}

export function setPasswordEmail(input: {
  to: string;
  tenantName: string | null | undefined;
  link: string;
  appUrl: string;
  expiresAt: Date;
}): EmailMessage {
  const business = cleanBusinessName(input.tenantName);
  const signIn = signInUrl(input.appUrl);
  const text = [
    business ? `You have an account in the CRM for ${business}.` : "You have an account in the CRM.",
    "",
    "Choose your password with this link:",
    input.link,
    "",
    `The link works once and expires in ${SET_PASSWORD_LINK_HOURS} hours (${formatUtc(input.expiresAt)}).`,
    `Then sign in at ${signIn} with this email address and your new password.`,
    `If the link has expired, open ${signIn} and choose "Forgot password".`,
    "",
    "If you did not expect this email, you can ignore it.",
  ].join("\n");
  return {
    kind: "password_reset",
    to: input.to,
    subject: business ? `Choose your password for ${business}` : "Choose your password",
    text,
  };
}
