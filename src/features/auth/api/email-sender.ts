import { createHash } from "node:crypto";
import { parseRetryAfter } from "@/shared/lib/retry-after";

// Invites, password resets and admin alerts go through this interface. Two senders: the log-only one
// (no mail leaves; the default) and Resend (plain fetch, no dependency), reached only through the
// delivery guard in createEmailSenderFromEnv.
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

export type ResendConfig = { apiKey: string; from: string; fetch?: typeof fetch; now?: () => Date };

// Not exported from the feature's index: callers tell a 429 apart by `name` and read the wait.
class EmailRateLimitedError extends Error {
  override readonly name = "EmailRateLimitedError";
  constructor(readonly retryAfterSeconds: number | null) {
    super("Email provider is rate limiting (status 429).");
  }
}

// The same message in the same UTC hour gets the same key, so a retry cannot send it twice. The hour
// keeps a later identical mail (the daily admin alert) from being treated as a repeat. A hash, so the
// header carries no address and no link.
function idempotencyKey(message: EmailMessage, from: string, at: Date): string {
  const hour = Math.floor(at.getTime() / 3600_000);
  const content = JSON.stringify([hour, from, message.kind, message.to, message.subject, message.text]);
  return `crm-email-${createHash("sha256").update(content).digest("hex")}`;
}

// Resend's REST API: POST https://api.resend.com/emails with a Bearer key, an Idempotency-Key and
// { from, to, subject, text } (resend.com/docs/api-reference/emails/send-email; not exercised against
// the live service here). The key and the message body never reach the log; a failure names only the
// HTTP status. A 429 is not retried here: these sends run inside a request or the daily cron.
export function createResendEmailSender(config: ResendConfig): EmailSender {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());
  return {
    async send(message) {
      const at = now();
      let response: Response;
      try {
        response = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey(message, config.from, at),
          },
          body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new Error("Email provider could not be reached.");
      }
      if (response.status === 429) {
        throw new EmailRateLimitedError(parseRetryAfter(response.headers.get("retry-after"), at.getTime()));
      }
      if (!response.ok) throw new Error(`Email provider refused the message (status ${response.status}).`);
      return { delivered: true };
    },
  };
}

// One plain address. A list, a display name or spacing could smuggle in a second recipient.
const SINGLE_ADDRESS = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

function allowedRecipients(list: string | undefined): Set<string> {
  const entries = (list ?? "").split(",").map((entry) => entry.trim().toLowerCase());
  return new Set(entries.filter((entry) => SINGLE_ADDRESS.test(entry)));
}

export type EmailSenderDeps = { fetch?: typeof fetch };

// Fail closed. Real mail needs RESEND_API_KEY, EMAIL_FROM and EMAIL_DELIVERY_MODE set to exactly
// "allowlist" (only the exact addresses in EMAIL_ALLOWED_RECIPIENTS) or "live". Anything else logs.
export function createEmailSenderFromEnv(
  env: Record<string, string | undefined> = process.env,
  deps: EmailSenderDeps = {},
): EmailSender {
  const logSender = createLogEmailSender();
  const mode = env.EMAIL_DELIVERY_MODE?.trim() ?? "";
  if (mode !== "" && mode !== "log" && mode !== "allowlist" && mode !== "live") {
    console.warn("Email: EMAIL_DELIVERY_MODE is not log, allowlist or live, so no email is sent (log only).");
    return logSender;
  }
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.warn("Email: RESEND_API_KEY or EMAIL_FROM is not set, so no email is sent (log only).");
    return logSender;
  }
  if (mode !== "allowlist" && mode !== "live") {
    console.warn("Email: EMAIL_DELIVERY_MODE is log, so no email is sent (log only).");
    return logSender;
  }

  const allowed = allowedRecipients(env.EMAIL_ALLOWED_RECIPIENTS);
  if (mode === "allowlist" && allowed.size === 0) {
    console.warn("Email: EMAIL_ALLOWED_RECIPIENTS has no valid address, so no email is sent (log only).");
    return logSender;
  }
  const resend = createResendEmailSender({ apiKey, from, fetch: deps.fetch });
  return {
    send(message) {
      const permitted =
        SINGLE_ADDRESS.test(message.to) && (mode === "live" || allowed.has(message.to.toLowerCase()));
      return permitted ? resend.send(message) : logSender.send(message);
    },
  };
}
