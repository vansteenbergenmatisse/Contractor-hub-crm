import { highLevelSignInUrl, parseSignInSlug, resolveHighLevelSignIn, type HighLevelSignIn } from "./highlevel-sign-in";

// The way back after a long session ends (365 days, or a sign-in in HighLevel's frame that ended).
// When a client's person signs in (password, the full-screen handoff / pairing, or /embed inside
// HighLevel), a cookie keeps which client's personal link they use and a MASKED email
// (j•••@gmail.com). /sign-in reads it on the server and links straight to that client's CRM page in
// HighLevel. It grants nothing: it is not a session, the slug is checked against connected clients
// before a link is built, and the local part of the email is never stored. Signing out clears it
// (shared devices); otherwise it simply expires.
export const SIGN_IN_HINT_COOKIE = "crm_sign_in_hint";
// Browsers keep a cookie at most 400 days; a longer Max-Age is cut to that anyway.
export const SIGN_IN_HINT_MAX_AGE_SECONDS = 400 * 24 * 3600;

const DOT = "•••";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
// Characters never allowed in a hint (it is shown on a page): whitespace, @ and HTML-special ones.
const ODD = /[\s@<>"'&`]/u;
// The top-level label must be plain ASCII (an IDN domain is kept as given, but its last label is not).
const TLD = /^[a-z0-9-]{1,63}$/;
// What maskEmailHint makes: one character, the dots, @, then the whole domain.
function isMasked(value: string): boolean {
  if (value.length > 300 || ODD.test(value.replace("@", ""))) return false;
  const at = value.indexOf("@");
  if (at < 0) return false;
  const local = value.slice(0, at);
  if (Array.from(local).length !== 1 + DOT.length || !local.endsWith(DOT)) return false;
  return isDomain(value.slice(at + 1));
}

function isDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253 || ODD.test(domain)) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => label.length === 0 || label.length > 63)) return false;
  return TLD.test(labels[labels.length - 1]);
}

// The first character of the address, the dots, and the whole domain (j•••@gmail.com): the person
// sees which login they used, the rest of the local part (with any +tag) never appears. Null for
// anything that is not an email, or whose top-level label is not plain ASCII. Never throws.
export function maskEmailHint(email: string): string | null {
  if (typeof email !== "string") return null;
  const value = email.trim().toLowerCase();
  if (value.length > 254 || !EMAIL_PATTERN.test(value)) return null;
  const at = value.indexOf("@");
  const first = Array.from(value.slice(0, at))[0];
  const domain = value.slice(at + 1);
  if (!first || ODD.test(first) || !isDomain(domain)) return null;
  const masked = `${first}${DOT}@${domain}`;
  return isMasked(masked) ? masked : null;
}

export type SignInHint = { slug: string | null; email: string };

export function encodeSignInHint(input: { slug: string | null; email: string }): string {
  const masked = maskEmailHint(input.email);
  return Buffer.from(JSON.stringify({ s: parseSignInSlug(input.slug), e: masked }), "utf8").toString("base64url");
}

// Null for anything that is not exactly what encodeSignInHint writes: a hint with a bad slug or an
// unmasked email is dropped whole.
export function parseSignInHint(raw: string | undefined | null): SignInHint | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { s, e } = data as { s?: unknown; e?: unknown };
  if (typeof e !== "string" || !isMasked(e)) return null;
  if (s === null || s === undefined) return { slug: null, email: e };
  const slug = parseSignInSlug(s);
  return slug ? { slug, email: e } : null;
}

export type SignInPage = { brandClient: unknown; highLevel: HighLevelSignIn; hint: { email: string } | null };

// What /sign-in shows. A personal link (?client=) wins; the hint is used only when there is none or it
// names the same client. A hint whose client is unknown, not connected or has login off is dropped:
// the page is then exactly the generic one.
export async function resolveSignInPage(
  input: { client: unknown; hint: string | undefined | null },
  deps: { template: string | undefined; findLocationId: (slug: string) => Promise<string | null> },
): Promise<SignInPage> {
  const clientSlug = parseSignInSlug(input.client);
  let hint = parseSignInHint(input.hint);
  if (hint && clientSlug && hint.slug !== clientSlug) hint = null;
  if (!hint) {
    return { brandClient: input.client, highLevel: await resolveHighLevelSignIn(clientSlug, deps), hint: null };
  }
  if (!hint.slug) {
    return { brandClient: input.client, highLevel: await resolveHighLevelSignIn(clientSlug, deps), hint: { email: hint.email } };
  }
  const locationId = await deps.findLocationId(hint.slug).catch(() => null);
  if (!locationId) {
    return { brandClient: input.client, highLevel: await resolveHighLevelSignIn(clientSlug, deps), hint: null };
  }
  return { brandClient: input.client ?? hint.slug, highLevel: highLevelSignInUrl({ template: deps.template, locationId }), hint: { email: hint.email } };
}
