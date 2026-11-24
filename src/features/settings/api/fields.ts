import type { ColorGroup, Connection, Field, SectionKey } from "../types";
import { isSettingsKeyAllowed } from "./allowlist";
import { OUR_WORK_KEYS, PAGE_TEXT_KEY, SOCIAL_KEYS, folderKeyLabel } from "./folder-keys";

// Folder 01_Business_essentials (build prompt section 5). Keys never change.
export const ESSENTIAL_FIELDS: Field[] = [
  { key: "business_name", label: "Business name" },
  { key: "business_owner_name", label: "Owner name" },
  { key: "business_phone_number", label: "Phone" },
  { key: "business_email", label: "Email" },
  { key: "business_address", label: "Full address" },
  { key: "business_hours", label: "Hours" },
  { key: "business_main_city", label: "Main city" },
  { key: "business_main_county", label: "County" },
  { key: "business_main_state_abbreviation", label: "State" },
  { key: "business_main_keyword", label: "Main keyword" },
  { key: "business_website_url", label: "Website" },
  { key: "universal_cta", label: "Button text" },
  { key: "business_logo", label: "Logo (link to the image)" },
  { key: "business_favicon_url", label: "Favicon (link to the image)" },
  { key: "business_main_background_video_or_image", label: "Sign-in background (link to an image)" },
  { key: "referral_reward_text", label: "Referral reward text" },
  { key: "seasonal_offer_text", label: "Seasonal offer text" },
];

// Folder 02_Branding, colors only (font keys are ignored).
export const COLOR_GROUPS: ColorGroup[] = [
  {
    heading: "Main color",
    fields: [
      { key: "main_color", label: "Main color" },
      { key: "main_hover_color", label: "Main, pressed" },
      { key: "main_light_color", label: "Main, light" },
      { key: "main_background_color", label: "Main, soft background" },
      { key: "main_border_color", label: "Main, border" },
    ],
  },
  {
    heading: "Second color and status colors",
    fields: [
      { key: "sub_color", label: "Second color" },
      { key: "highlight_color", label: "Highlight (waiting)" },
      { key: "error_color", label: "Error (late)" },
    ],
  },
  {
    heading: "Backgrounds and borders",
    fields: [
      { key: "background_color", label: "Card background" },
      { key: "section_background_color", label: "Page background" },
      { key: "border_color", label: "Border" },
    ],
  },
  {
    heading: "Text",
    fields: [
      { key: "text_color", label: "Text" },
      { key: "light_text_color", label: "Text, light" },
      { key: "text_on_main_color", label: "Text on main color" },
    ],
  },
];

export const ESSENTIAL_KEYS: string[] = ESSENTIAL_FIELDS.map((f) => f.key);
export const COLOR_KEYS: string[] = COLOR_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
// Keys the sub-account has that the design does not list (for example business_address_city or
// residentialservice3). Each shows in its layout folder; only values change. Only keys the
// classifier shows (the server filters first): a secret custom value never becomes a field.
export function extraKeys(values: Record<string, string>): string[] {
  const known = new Set([...ESSENTIAL_KEYS, ...COLOR_KEYS]);
  return Object.keys(values).filter((k) => !known.has(k) && isSettingsKeyAllowed(k));
}

// The field's label: the design's label for a key it lists ("main_hover_color" gives "Main, pressed"),
// else one made from the key itself ("business_address_city" gives "Business address city").
export function labelOfKey(key: string): string {
  const known = [...ESSENTIAL_FIELDS, ...COLOR_GROUPS.flatMap((g) => g.fields)].find((f) => f.key === key);
  if (known) return known.label;
  const numbered = folderKeyLabel(key);
  if (numbered) return numbered;
  const words = key.replace(/_/g, " ").replace(/([a-z])(\d)/gi, "$1 $2").replace(/(\d)([a-z])/gi, "$1 $2").replace(/\s+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const LINK_KEYS: string[] = [
  "business_logo", "business_favicon_url", "business_main_background_video_or_image",
  "business_website_url", "request_a_job_booking_link", "request_a_quote_booking_link",
  "business_google_profile_url", "google_review_request_url", "bbb_review_request_url",
  ...SOCIAL_KEYS, ...OUR_WORK_KEYS,
];
const LINK_SET: ReadonlySet<string> = new Set(LINK_KEYS);
// Names that hold a link or an image link, for keys the list above does not name (a new booking
// link, a partner logo, project 100). Their values must be https links, in the form and on write.
const LINK_NAME = /(_url|_link|_logo|_image|_img|_photo|_picture|_favicon)$|^\d+_our_work_(before|after)$/i;
export const isLinkKey = (key: string): boolean => LINK_SET.has(key) || (LINK_NAME.test(key) && !PAGE_TEXT_KEY.test(key));

// A website page's HTML text or URL slug (`residentialservice1content`, `bizarea3path`). Shown as
// plain text; editable only inside a protected folder's unlock step.
export const isPageTextKey = (key: string): boolean => PAGE_TEXT_KEY.test(key);

// The brand reader's spellings of one fact, in its order (brand/api/build-brand.ts).
const READER_SPELLINGS: readonly (readonly string[])[] = [
  ["business_address_city", "business_main_city"],
  ["business_address_state", "business_main_state_abbreviation"],
];

// Keys the reader ignores for this account, so an edit there would change nothing the app shows. The
// reader takes the first filled-in spelling; with none filled in, the first the account has.
export function shadowedKeys(values: Record<string, string>): Set<string> {
  const out = new Set<string>();
  for (const keys of READER_SPELLINGS) {
    const present = keys.filter((key) => Object.hasOwn(values, key));
    const used = present.find((key) => values[key].trim() !== "") ?? present[0];
    if (used) for (const key of keys) if (key !== used) out.add(key);
  }
  return out;
}

export const SECTIONS: { key: SectionKey; title: string; headingId: string }[] = [
  { key: "biz", title: "Business details", headingId: "fd-st-1" },
  { key: "colors", title: "Brand colors", headingId: "fd-st-2" },
  { key: "conn", title: "Connections", headingId: "fd-st-4" },
  { key: "choice", title: "Your choices", headingId: "fd-st-3" },
  { key: "soon", title: "Not available yet", headingId: "fd-st-5" },
];

export function sectionTitle(key: SectionKey): string {
  return SECTIONS.find((s) => s.key === key)?.title ?? "";
}

// Connection rows in the design's order. Status: see api/connections.ts.
export const CONNECTIONS: Connection[] = [
  {
    name: "Business phone number",
    sub: "Calls and texts to this number land in Communications.",
    need: "Nothing. Forge Forward sets it up and gets it verified.",
    steps: [
      "Forge Forward sets up your business number.",
      "Forge Forward gets it A2P verified, so your texts get delivered.",
      "Calls and texts to it land in Communications.",
      "A missed call gets a text back at once.",
    ],
  },
  {
    name: "Calendar",
    sub: "Your own calendar and this one stay the same, both ways.",
    need: "Your Google Calendar or Outlook sign-in. Another calendar works with its link.",
    steps: [
      "Ask Forge Forward to connect it.",
      "Pick Google Calendar, Outlook or another calendar.",
      "Sign in and allow the calendar.",
      "Jobs and estimates show in both calendars from then on.",
    ],
  },
  {
    name: "Facebook page",
    sub: "Messages to your page land in Communications.",
    need: "Admin rights on your Facebook page.",
    steps: [
      "Ask Forge Forward to connect it.",
      "Sign in to Facebook in the window that opens.",
      "Pick your business page.",
      "Messages to your page land in Communications.",
    ],
  },
  {
    name: "Instagram",
    sub: "Instagram messages land in Communications.",
    need: "An Instagram business account linked to your Facebook page.",
    steps: [
      "Ask Forge Forward to connect it.",
      "Sign in to Instagram in the window that opens.",
      "Allow messages.",
      "Instagram messages land in Communications.",
    ],
  },
  {
    name: "Google My Business",
    sub: "Review requests use your own Google review link. Leads from Google show their source.",
    need: "The Google account that owns your Business Profile.",
    steps: [
      "Ask Forge Forward to connect it.",
      "Sign in with that Google account.",
      "Pick your business.",
      "Review requests use your own review link.",
    ],
  },
  {
    name: "Online payments",
    sub: "Customers pay invoices online. A paid invoice marks itself paid.",
    need: "Your payment processor sign-in and your bank details at hand.",
    steps: [
      "Ask Forge Forward to connect it.",
      "Pick your payment processor and sign in.",
      "Enter your bank details there. They never pass through this dashboard.",
      "Customers pay their invoices online and payments track themselves.",
    ],
  },
];

export const SWITCHES: string[] = [
  "Approve every quote before it goes out",
  "Customers pick their own job date",
];

// Rule 9: no working switch for a feature the system does not have.
export const SOON_ITEMS: string[] = [
  "Ask a deposit when a quote is accepted",
  "Share your live location on job days",
  "Sign in with your face or fingerprint on this device",
];

export function sectionOfKey(key: string): SectionKey | null {
  if (COLOR_KEYS.includes(key)) return "colors";
  if (ESSENTIAL_KEYS.includes(key)) return "biz";
  return null;
}
