import type { Field } from "../types";
import { labelOfKey } from "./fields";

// Where each custom value sits on the Business details page. HighLevel's API gives no folder, type or
// position, so this map is the only source of the arrangement. A key the account lacks is left out.
export type GroupField = {
  key: string;
  // The HighLevel folder, shown as helper text on links.
  folder?: string;
  // Which links are required is not decided. Leave unset until it is.
  required?: boolean;
};
export type FieldGroup = { title: string; fields: GroupField[] };
export type ShownField = Field & GroupField;
export type ShownGroup = { title: string; fields: ShownField[] };

const GOOGLE_FOLDER = "01b_Google_Business_Profile";
const BOOKING_FOLDER = "01c_booking_links";
// docs/tenant-branding.md lists the website key with the Business essentials keys.
const ESSENTIALS_FOLDER = "01_Business_essentials";

const plain = (...keys: string[]): GroupField[] => keys.map((key) => ({ key }));

export const FIELD_GROUPS: FieldGroup[] = [
  { title: "Business", fields: plain("business_name", "business_owner_name", "business_phone_number", "business_email", "business_main_keyword", "universal_cta") },
  {
    title: "Location",
    fields: plain(
      "business_address", "business_full_address", "business_main_city", "business_main_county",
      "business_main_state_abbreviation", "business_address_city", "business_address_state",
      "business_latitude", "business_longitude",
    ),
  },
  {
    title: "Hours",
    fields: plain(
      "business_hours",
      "business_hours_weekdays_open", "business_hours_weekdays_close",
      "business_hours_saturday_open", "business_hours_saturday_close",
      "business_hours_sunday_open", "business_hours_sunday_close",
    ),
  },
  { title: "Images", fields: plain("business_logo", "business_favicon_url", "business_main_background_video_or_image") },
  {
    title: "Links",
    fields: [
      { key: "business_website_url", folder: ESSENTIALS_FOLDER },
      { key: "business_google_profile_url", folder: GOOGLE_FOLDER },
      { key: "google_review_request_url", folder: GOOGLE_FOLDER },
      { key: "bbb_review_request_url", folder: GOOGLE_FOLDER },
      { key: "request_a_job_booking_link", folder: BOOKING_FOLDER },
      { key: "request_a_quote_booking_link", folder: BOOKING_FOLDER },
    ],
  },
  { title: "Offers", fields: plain("referral_reward_text", "seasonal_offer_text") },
];

export const SVG_IMAGE_KEYS: ReadonlySet<string> = new Set(["business_logo", "business_favicon_url"]);
export const IMAGE_KEYS: ReadonlySet<string> = new Set(FIELD_GROUPS[3].fields.map((f) => f.key));
export const LINK_GROUP_KEYS: ReadonlySet<string> = new Set(FIELD_GROUPS[4].fields.map((f) => f.key));
// Only an image file can be previewed here: this value may also hold a video.
export const BACKGROUND_KEY = "business_main_background_video_or_image";

// The groups for the keys on screen, in map order, without empty groups. An allowlisted key the map
// does not know yet goes under Business, so adding one to the allowlist can never lose its field.
export function groupFields(keys: readonly string[]): ShownGroup[] {
  const shown = new Set(keys);
  const mapped = new Set(FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
  const unmapped = keys.filter((key) => !mapped.has(key)).map((key) => ({ key }));
  return FIELD_GROUPS.map((group, i) => ({
    title: group.title,
    fields: [...group.fields.filter((f) => shown.has(f.key)), ...(i === 0 ? unmapped : [])].map((f) => ({ ...f, label: labelOfKey(f.key) })),
  })).filter((group) => group.fields.length > 0);
}
