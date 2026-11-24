import { highLevelSignInUrl, parseSignInSlug, resolveHighLevelSignIn, type HighLevelSignIn } from "./highlevel-sign-in";

// The way back after a long session ends (365 days, or signed out). When a client's person gets a
// long session (password sign-in, or the full-screen handoff / pairing), a first-party cookie keeps
// which client's personal link they use and a MASKED email (j•••@g•••.com). /sign-in reads it on the
// server and links straight to that client's CRM page in HighLevel.
// It grants nothing: it is not a session, the slug is checked against connected clients before a link
// is built, and the email is never stored in full. It stays after signing out (masked, harmless).
export const SIGN_IN_HINT_COOKIE = "crm_sign_in_hint";
// Browsers keep a cookie at most 400 days; a longer Max-Age is cut to that anyway.
export const SIGN_IN_HINT_MAX_AGE_SECONDS = 400 * 24 * 3600;

const DOT = "•••";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
// What maskEmailHint makes: one character, the dots, @, one character, the dots, the last label.
const MASKED_PATTERN = /^[^\s@<>"'&]•••@[^\s@.<>"'&]•••\.[a-z0-9-]{1,63}$/u;

// First character of the address, first character of the domain, and the top-level label. The rest of
// the local part (with any +tag) and the domain name never appear.
export function maskEmailHint(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (value.length > 254 || !EMAIL_PATTERN.test(value)) return null;
  const [local, domain] = value.split("@");
  const labels = domain.split(".");
  const tld = labels[labels.length - 1];
  if (!/^[a-z0-9-]{1,63}$/.test(tld)) return null;
  const masked = `${Array.from(local)[0]}${DOT}@${Array.from(domain)[0]}${DOT}.${tld}`;
  return MASKED_PATTERN.test(masked) ? masked : null;
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
  if (typeof e !== "string" || !MASKED_PATTERN.test(e)) return null;
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
