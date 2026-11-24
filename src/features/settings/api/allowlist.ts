// Which custom values may reach the browser. The server classifies every key HighLevel returns and
// builds the Settings value map from the shown ones only, so the form webhook (`0_webhook_url_form`,
// build prompt section 5) and any other secret an agency keeps in a custom value stay on the server
// (hard rule 1): neither its name nor its value is sent. Writes re-check with the same classifier
// (write-back.ts, media-route.ts). The layout file (layout.ts) only decides where a shown key sits;
// it never makes a key visible or writable. Pure: no server-only imports.

const KEY_CHARS = /^[A-Za-z0-9_]{1,100}$/;
// Secret-looking names. Checked on every key; a match is never shown and never written. The model is
// default-allow (every other key shows), so this list errs towards hiding: a hidden key costs the
// owner one field, a missed one leaks. Short words only match as a whole part of the name
// (`(^|_)pin(_|\d|$)`), so `business_pinterest_url` or `possession_text` still show.
// Before a word: start, `_` or a digit. After: end, `_` or a digit. `\b` does not work, as `_` is a word character.
const W = (words: string) => new RegExp(`(^|_|\\d)(${words})(_|\\d|$)`, "i");
const DENY: readonly RegExp[] = [
  /webhook|hook|endpoint|callback|token|secret|passw|passwd|passcode|pwd|credential|private|embed|bearer|signature|jwt|hmac|dsn|database|smtp|captcha|stripe|api_?key|client_?id/i,
  /bank|account_number|routing_number|iban|card_?(number|num|no)|cvv|cvc|tax_?(number|num|no)|vat_?(number|num|no)|social_security|pin_?code/i,
  // `auth` anywhere except the word `author` (a review's author); `authorization` stays secret.
  /auth(?!ors?(_|\d|$))/i,
  // A key: `stripekey`, `license_key2`, `access_keys`, `key_name`.
  /keys?\d*$/i, W("key"),
  W("pass|pin|otp|ssn|ein|pit|salt|sid|session|signing|sk|rk|pk|ssh|id"),
];
const isSecretName = (key: string) => DENY.some((re) => re.test(key));

// Values that are secrets whatever their key is called: known token prefixes, webhook hosts and
// paths, and links with a user name and password in them. Checked on the server on read and write.
const SECRET_VALUE: readonly RegExp[] = [
  /\b[sr]k_(live|test)_\w/, /\bpk_live_\w/, /\bxox[abposr]-/, /\bgh[pousr]_\w{20,}/, /\bgithub_pat_\w/, /\bpit-[0-9a-f]{8}-/i,
  /\beyJ[\w-]{5,}\.[\w-]{5,}\./, /\bAKIA[0-9A-Z]{16}\b/, /\bAIza[\w-]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY/,
  /\/\/hooks?\.[^\s/]*/i, /\/\/[^\s/]*\b(make\.com|integromat\.com|n8n\.[a-z]+|pipedream\.net)\b/i, /\/\/[^\s/]+\/[^\s]*\b(webhooks?|hooks)\//i,
  /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i,
];
export const isSecretValue = (value: string): boolean => SECRET_VALUE.some((re) => re.test(value));
export const MAX_VALUE_LENGTH = 2000;

export type KeyClass = "secret" | "shown";

// "secret": stays on the server (not well formed, starts with `0_` or `_`, ends with `_`, or has a
// secret-looking name). "shown": the owner sees and may edit it.
export function classifyKey(key: string): KeyClass {
  if (typeof key !== "string" || !KEY_CHARS.test(key)) return "secret";
  if (key.startsWith("0_") || key.startsWith("_") || key.endsWith("_")) return "secret";
  return isSecretName(key) ? "secret" : "shown";
}

// `key` passes when it is on `list` and is not secret.
export function isKeyAllowedBy(key: string, list: ReadonlySet<string>): boolean {
  return classifyKey(key) === "shown" && list.has(key);
}

export function isSettingsKeyAllowed(key: string): boolean {
  return classifyKey(key) === "shown";
}

type Row = { key: string; value: string | null | undefined };

// What the server sends for one account: the shown keys with their values, and the shown keys whose
// value is over 2000 characters (`longKeys`). A long value is listed by name only: it is read-only on
// the page ("too long to edit here") and its text is not sent. The first row of a key wins. A key
// whose value looks secret (isSecretValue) is kept on the server like a secret name, and listed in
// `hiddenKeys` with the secret names (names only, for the server log).
export function settingsReadFrom(rows: readonly Row[]): { values: Record<string, string>; longKeys: string[]; hiddenKeys?: string[] } {
  const values: Record<string, string> = {};
  const long = new Set<string>();
  const seen = new Set<string>();
  const hidden = new Set<string>();
  for (const { key, value } of rows) {
    const v = value ?? "";
    if (typeof key !== "string" || typeof v !== "string" || seen.has(key)) continue;
    seen.add(key);
    if (!isSettingsKeyAllowed(key) || isSecretValue(v)) {
      if (KEY_CHARS.test(key)) hidden.add(key);
      continue;
    }
    if (v.length > MAX_VALUE_LENGTH) long.add(key);
    else values[key] = v;
  }
  return hidden.size > 0 ? { values, longKeys: [...long], hiddenKeys: [...hidden].sort() } : { values, longKeys: [...long] };
}

// The key-to-value map the Settings page gets (long values left out, see settingsReadFrom).
export function settingsValuesFrom(rows: readonly Row[]): Record<string, string> {
  return settingsReadFrom(rows).values;
}
