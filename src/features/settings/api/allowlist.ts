// Which custom values may reach the browser. The server classifies every key HighLevel returns and
// builds the Settings value map from the shown ones only, so the form webhook (`0_webhook_url_form`,
// build prompt section 5) and any other secret an agency keeps in a custom value stay on the server
// (hard rule 1): neither its name nor its value is sent. Writes re-check with the same classifier
// (write-back.ts, media-route.ts). The layout file (layout.ts) only decides where a shown key sits;
// it never makes a key visible or writable. Pure: no server-only imports.

const KEY_CHARS = /^[A-Za-z0-9_]{1,100}$/;
// Secret-looking names. Checked on every key; a match is never shown and never written.
const DENY =
  /webhook|token|secret|password|passwd|passcode|api_key|apikey|embed|credential|private|bank|account_number|routing_number|iban|client_id|clientid|bearer|oauth|auth_|_auth$|signing|session|_key$|_id$|_sid$/i;
export const MAX_VALUE_LENGTH = 2000;

export type KeyClass = "secret" | "shown";

// "secret": stays on the server (not well formed, starts with `0_` or `_`, ends with `_`, or has a
// secret-looking name). "shown": the owner sees and may edit it.
export function classifyKey(key: string): KeyClass {
  if (typeof key !== "string" || !KEY_CHARS.test(key)) return "secret";
  if (key.startsWith("0_") || key.startsWith("_") || key.endsWith("_")) return "secret";
  return DENY.test(key) ? "secret" : "shown";
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
// the page ("too long to edit here") and its text is not sent. The first row of a key wins.
export function settingsReadFrom(rows: readonly Row[]): { values: Record<string, string>; longKeys: string[] } {
  const values: Record<string, string> = {};
  const long = new Set<string>();
  for (const { key, value } of rows) {
    if (typeof key !== "string" || !isSettingsKeyAllowed(key) || Object.hasOwn(values, key) || long.has(key)) continue;
    const v = value ?? "";
    if (typeof v !== "string") continue;
    if (v.length > MAX_VALUE_LENGTH) long.add(key);
    else values[key] = v;
  }
  return { values, longKeys: [...long] };
}

// The key-to-value map the Settings page gets (long values left out, see settingsReadFrom).
export function settingsValuesFrom(rows: readonly Row[]): Record<string, string> {
  return settingsReadFrom(rows).values;
}
