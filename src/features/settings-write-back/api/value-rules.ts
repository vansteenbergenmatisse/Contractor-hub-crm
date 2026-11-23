import { LINK_KEYS } from "@/features/settings";
import { safeHttpsUrl } from "@/shared/lib/safe-https-url";

// Stricter than the form, because these values leave the app and feed the client's website and
// messages, where we do not control the escaping. Refused everywhere: markup, quotes that could end
// an attribute, merge or template tags (a tag could expand to a secret custom value), and every
// Unicode control, format and bidi character.
const UNSAFE_TEXT = /[<>"`\\]|\{\{|\}\}|\{%|%\}|\p{C}/u;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d().\-\s]{3,25}$/;
const COORDINATE = /^-?\d{1,3}(\.\d+)?$/;
const HOURS_KEY = /^business_hours_[a-z]+_(open|close)$/;
// The format the brand reader can show: 24-hour HH:MM, or "closed".
const HOURS = /^(closed|([01]\d|2[0-3]):[0-5]\d)$/i;

function isSafeLink(value: string): boolean {
  if (value.includes("'") || !/^https:\/\/\S+$/i.test(value)) return false;
  const href = safeHttpsUrl(value);
  if (!href) return false;
  const url = new URL(href);
  return !url.username && !url.password;
}

function isInRange(value: string, limit: number): boolean {
  return COORDINATE.test(value) && Math.abs(Number(value)) <= limit;
}

export function isSafeToWrite(key: string, value: string): boolean {
  if (UNSAFE_TEXT.test(value)) return false;
  if (LINK_KEYS.includes(key)) return isSafeLink(value);
  if (key === "business_email") return EMAIL.test(value);
  if (key === "business_phone_number") return PHONE.test(value) && /\d/.test(value);
  if (key === "business_latitude") return isInRange(value, 90);
  if (key === "business_longitude") return isInRange(value, 180);
  if (HOURS_KEY.test(key)) return HOURS.test(value);
  return true;
}
