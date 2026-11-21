// Invites and password resets go through this interface. The only sender for now logs and sends
// nothing (user decision, round 1): a real provider (for example Resend) is a later ticket and a
// dependency or API key the user must approve. Nothing here may email a real client.
export type EmailMessage = {
  kind: "invite" | "password_reset";
  to: string;
  subject: string;
  // Holds the link with the single-use token. Senders must never log it.
  text: string;
};

export type EmailSender = {
  send(message: EmailMessage): Promise<{ delivered: boolean }>;
};

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1 || at === email.length - 1 || /\s/.test(email)) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

// Logs the kind, the masked recipient and the subject. Never the body, never the full address.
export function createLogEmailSender(
  log: (entry: { kind: EmailMessage["kind"]; to: string; subject: string }) => void = (entry) =>
    console.info("email (log only, not sent):", entry),
): EmailSender {
  return {
    async send(message) {
      log({ kind: message.kind, to: maskEmail(message.to), subject: message.subject });
      return { delivered: false };
    },
  };
}
