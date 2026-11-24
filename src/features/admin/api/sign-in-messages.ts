// What the admin reads after "Invite owner" or "Send sign-in email". It never says an email was sent
// unless the server says the provider took it ("sent"). The link is always shown next to it.
export type MailOutcome = "sent" | "held" | "capped" | "failed" | "unknown";

const MAIL_TEXT: Record<MailOutcome, (email: string) => string> = {
  sent: (email) => `Email sent to ${email}. The link is also below if you want to send it yourself.`,
  held: () => "Email not sent: email is switched off for this address. Copy the link below.",
  capped: () => "Email not sent: this client reached today's limit of sign-in emails. Copy the link below.",
  failed: () => "Email not sent: the email service refused it. Copy the link below.",
  // The daily limit could not be checked: never claim it was reached.
  unknown: () => "Email status unknown: we could not check this client's daily email limit. Copy the link below and send it yourself.",
};

const isMailOutcome = (value: unknown): value is MailOutcome =>
  typeof value === "string" && Object.hasOwn(MAIL_TEXT, value);

export type IssuedLinkBody = { kind?: unknown; link?: unknown; email?: unknown; mail?: unknown };

// One line for a successful answer (the link itself is shown after it), or null when the body is not usable.
export function issuedLinkMessage(body: IssuedLinkBody | null): string | null {
  if (!body || typeof body.link !== "string") return null;
  const email = typeof body.email === "string" ? body.email : "the person";
  const lifetime =
    body.kind === "set_password"
      ? "It sets their password, works once and expires in 24 hours."
      : "It works once, for 72 hours.";
  const intro = body.kind === "set_password" ? `${email} already has an account that was never used, so this is a set-password link.` : "";
  if (!isMailOutcome(body.mail)) {
    // An older server answer with no mail status: say nothing about email.
    return body.kind === "set_password" ? `${intro} ${lifetime} Send it to them:` : "Invite link (send it to the owner, it works once for 72 hours):";
  }
  return [intro, MAIL_TEXT[body.mail](email), lifetime].filter(Boolean).join(" ");
}
