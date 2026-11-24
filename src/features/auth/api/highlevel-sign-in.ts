// "Sign in with HighLevel" on /sign-in: where the button sends the browser.
//
// HighLevel does not document the address of a custom menu link (or a marketplace custom page) inside a
// sub-account (docs/greenlane/hl-api-notes.md, "Sign in with HighLevel"). So the address is not invented
// here: the operator copies it once from the browser's address bar after opening the CRM menu item in
// any sub-account, replaces that sub-account's id with `{locationId}`, and sets it as
// HIGHLEVEL_CRM_MENU_URL. An agency-level custom menu link has one id for every sub-account, so one
// template serves every client. A white-label domain works the same way.
//
// - Template set and the page knows the client (?client=<slug>): that sub-account's CRM page.
// - Template set, client unknown: the home of the same HighLevel host; the page tells the person to
//   open their business and then CRM in the left menu.
// - Template missing or invalid: HighLevel's app home, with the same instruction.
export const HIGHLEVEL_APP_HOME = "https://app.gohighlevel.com/";
export const LOCATION_PLACEHOLDER = "{locationId}";

const LOCATION_ID = /^[A-Za-z0-9_-]{1,64}$/;
// The same shape as the brand feature's personal-link slug (parseClientSlug). Anything else: no lookup.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const parseSignInSlug = (raw: unknown): string | null =>
  typeof raw === "string" && raw.length <= 60 && SLUG.test(raw) ? raw : null;

export type HighLevelSignIn = { href: string; direct: boolean };

// The template, checked: https, a host, exactly one placeholder, no user info. Null when unusable.
export function parseMenuUrlTemplate(raw: string | undefined | null): string | null {
  const template = (raw ?? "").trim();
  if (template.split(LOCATION_PLACEHOLDER).length !== 2) return null;
  let url: URL;
  try {
    url = new URL(template.replace(LOCATION_PLACEHOLDER, "location-id"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
  return template;
}

export function highLevelSignInUrl(input: { template: string | undefined | null; locationId: string | null }): HighLevelSignIn {
  const template = parseMenuUrlTemplate(input.template);
  if (!template) return { href: HIGHLEVEL_APP_HOME, direct: false };
  if (input.locationId && LOCATION_ID.test(input.locationId)) {
    return { href: template.replace(LOCATION_PLACEHOLDER, input.locationId), direct: true };
  }
  return { href: `${new URL(template.replace(LOCATION_PLACEHOLDER, "x")).origin}/`, direct: false };
}

// For the sign-in page: the button's target for this (validated) client slug. Any failure gives the
// generic target, never an error page. `findLocationId` answers only for a connected client.
export async function resolveHighLevelSignIn(
  slug: string | null,
  deps: { template: string | undefined; findLocationId: (slug: string) => Promise<string | null> },
): Promise<HighLevelSignIn> {
  let locationId: string | null = null;
  if (slug && parseMenuUrlTemplate(deps.template)) {
    locationId = await deps.findLocationId(slug).catch(() => null);
  }
  return highLevelSignInUrl({ template: deps.template, locationId });
}
