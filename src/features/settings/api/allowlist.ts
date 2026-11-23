import { COLOR_KEYS, ESSENTIAL_KEYS } from "./fields";
import { FOLDER_VALUE_KEYS } from "./folder-keys";

// Which custom values may reach the browser. The server builds the Settings value map from this list,
// so the form webhook (`0_webhook_url_form`, build prompt section 5) and any other secret an agency
// keeps in a custom value stay on the server (hard rule 1). Pure: no server-only imports.

// Documented profile, hours, booking and Google keys (docs/tenant-branding.md, the brand reader's
// spellings) that the design does not list. Exact names only: no prefix, so a key such as
// `business_main_stripe_key` never passes.
const EXTRA_KEYS: readonly string[] = [
  "business_full_address",
  "business_address_city",
  "business_address_state",
  "business_latitude",
  "business_longitude",
  "business_hours_weekdays_open",
  "business_hours_weekdays_close",
  "business_hours_saturday_open",
  "business_hours_saturday_close",
  "business_hours_sunday_open",
  "business_hours_sunday_close",
  "request_a_job_booking_link",
  "request_a_quote_booking_link",
  "business_google_profile_url",
  "google_review_request_url",
  "bbb_review_request_url",
];
// Built on first use: fields.ts imports this file too, so its lists are not ready at load time.
let allowed: Set<string> | null = null;
const allowedKeys = () => (allowed ??= new Set<string>([...ESSENTIAL_KEYS, ...COLOR_KEYS, ...EXTRA_KEYS, ...FOLDER_VALUE_KEYS]));
const KEY_CHARS = /^[A-Za-z0-9_]{1,100}$/;
// Backstop applied to every key, allowlisted or not.
const DENY = /webhook|token|secret|password|api_key|apikey|embed|credential|private|bank|account_number|_key$/i;
export const MAX_VALUE_LENGTH = 2000;

// `key` passes when it is on `list` and clears every backstop: plain characters, at most 100 long,
// no `0_` or `_` start, and no secret-looking word (the deny rule decides even for a listed key).
export function isKeyAllowedBy(key: string, list: ReadonlySet<string>): boolean {
  return clearsBackstops(key) && list.has(key);
}

function clearsBackstops(key: string): boolean {
  return KEY_CHARS.test(key) && !key.startsWith("0_") && !key.startsWith("_") && !DENY.test(key);
}

export function isSettingsKeyAllowed(key: string): boolean {
  return isKeyAllowedBy(key, allowedKeys());
}

type Row = { key: string; value: string | null | undefined };

// The key-to-value map the Settings page gets. A value over 2000 characters is dropped (a custom value
// that long is markup or a blob, not a business detail). The first row of a key wins.
export function settingsValuesFrom(rows: readonly Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of rows) {
    if (typeof key !== "string" || !isSettingsKeyAllowed(key) || Object.hasOwn(out, key)) continue;
    const v = value ?? "";
    if (typeof v !== "string" || v.length > MAX_VALUE_LENGTH) continue;
    out[key] = v;
  }
  return out;
}
