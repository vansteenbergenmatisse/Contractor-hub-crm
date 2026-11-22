// Invites, password resets and admin alerts go through this interface. Two senders: the log-only one
// (no mail leaves; used when no provider key is set) and Resend (plain fetch, no dependency).
export type EmailMessage = {
  kind: "invite" | "password_reset" | "admin_alert";
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

export type ResendConfig = { apiKey: string; from: string; fetch?: typeof fetch };

// Resend's REST API: POST https://api.resend.com/emails with a Bearer key and { from, to, subject,
// text } (resend.com/docs/api-reference/emails/send-email; not exercised against the live service
// here). The key and the message body never reach the log; a failure names only the HTTP status.
export function createResendEmailSender(config: ResendConfig): EmailSender {
  const doFetch = config.fetch ?? fetch;
  return {
    async send(message) {
      let response: Response;
      try {
        response = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new Error("Email provider could not be reached.");
      }
      if (!response.ok) throw new Error(`Email provider refused the message (status ${response.status}).`);
      return { delivered: true };
    },
  };
}

// Resend when both variables are set, otherwise log-only (and one warning so nobody wonders).
export function createEmailSenderFromEnv(env: Record<string, string | undefined> = process.env): EmailSender {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (apiKey && from) return createResendEmailSender({ apiKey, from });
  console.warn("Email: RESEND_API_KEY or EMAIL_FROM is not set, so no email is sent (log only).");
  return createLogEmailSender();
}
