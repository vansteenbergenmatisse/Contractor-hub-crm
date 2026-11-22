// Server-log details for a failed HighLevel or install step. The HTTP response never carries any of
// this. Text is redacted before it is written: token-like JSON and form values, bearer tokens,
// JWTs, credentials in URLs, and the values of the server's own secrets.
const MAX_BODY = 500;
const MAX_STACK = 4000;
const MIN_SECRET_LENGTH = 8; // a shorter value would blank ordinary words
const SECRET_ENV_NAMES = [
  "GHL_CLIENT_SECRET",
  "GHL_APP_SHARED_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
] as const;
const SENSITIVE_KEY = "access_token|refresh_token|id_token|client_secret|client_id|code|password|token|secret|authorization";

export function redact(text: string): string {
  let out = text;
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value && value.length >= MIN_SECRET_LENGTH) out = out.split(value).join("[redacted]");
  }
  return out
    .replace(new RegExp(`("(?:${SENSITIVE_KEY})"\\s*:\\s*)"[^"]*"`, "gi"), '$1"[redacted]"')
    .replace(new RegExp(`\\b((?:${SENSITIVE_KEY})=)[^&\\s"]+`, "gi"), "$1[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[redacted-jwt]")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]*@/gi, "$1[redacted]@");
}

export type DescribedError = {
  name: string;
  message: string;
  stack: string | null;
  status: number | null;
  body: string | null;
};

export function describeError(error: unknown): DescribedError {
  if (!(error instanceof Error)) {
    return { name: "unknown error", message: "", stack: null, status: null, body: null };
  }
  const extra = error as Error & { status?: unknown; detail?: unknown };
  return {
    name: error.name,
    message: redact(error.message),
    stack: error.stack ? redact(error.stack).slice(0, MAX_STACK) : null,
    status: typeof extra.status === "number" ? extra.status : null,
    body: typeof extra.detail === "string" ? redact(extra.detail).slice(0, MAX_BODY) : null,
  };
}

export function logError(context: string, error: unknown): void {
  const d = describeError(error);
  const parts = [`${context}: ${d.name}`];
  if (d.message) parts.push(`message: ${d.message}`);
  if (d.status !== null) parts.push(`status: ${d.status}`);
  if (d.body) parts.push(`body: ${d.body}`);
  if (d.stack) parts.push(`stack: ${d.stack}`);
  console.error(parts.join("\n"));
}
