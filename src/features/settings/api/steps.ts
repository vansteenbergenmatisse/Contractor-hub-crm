import { COLOR_KEYS } from "./fields";
import { FIELD_GROUPS } from "./field-groups";
import { AREA_KEYS, COMMERCIAL_KEYS, OUR_WORK_KEYS, RESIDENTIAL_KEYS, SERVICE_TYPE_KEYS, SOCIAL_KEYS } from "./folder-keys";

// The guided page: seven steps that save on their own, then the protected folders. Only real custom
// value keys appear here. A key the account lacks is left out when the page is drawn.
export type StepId = "biz" | "loc" | "img" | "soc" | "gbp" | "book" | "col";
export type ProtectedId = "res" | "com" | "typ" | "area";
export type Step<Id extends string = StepId> = { id: Id; title: string; line: string; keys: readonly string[] };

const groupKeys = (...titles: string[]) => FIELD_GROUPS.filter((g) => titles.includes(g.title)).flatMap((g) => g.fields.map((f) => f.key));
const GOOGLE_KEYS = ["business_google_profile_url", "google_review_request_url", "bbb_review_request_url"];
const BOOKING_KEYS = ["request_a_job_booking_link", "request_a_quote_booking_link"];

export const STEPS: readonly Step[] = [
  { id: "biz", title: "Business", line: "Who you are and how customers reach you.", keys: [...groupKeys("Business"), "business_website_url"] },
  { id: "loc", title: "Location and hours", line: "Where you work and when you are open.", keys: groupKeys("Location", "Hours") },
  { id: "img", title: "Images and offers", line: "Your logo, photos and current offers.", keys: [...groupKeys("Images", "Offers"), ...OUR_WORK_KEYS] },
  { id: "soc", title: "Social links", line: "Links to your social pages.", keys: SOCIAL_KEYS },
  { id: "gbp", title: "Google Business Profile", line: "Your Google profile and review links.", keys: GOOGLE_KEYS },
  { id: "book", title: "Booking links", line: "Where customers ask for a job or a quote.", keys: BOOKING_KEYS },
  { id: "col", title: "Brand colors", line: "The colors of your dashboard and website.", keys: COLOR_KEYS },
];

export const PROTECTED_STEPS: readonly Step<ProtectedId>[] = [
  { id: "res", title: "Residential services", line: "", keys: RESIDENTIAL_KEYS },
  { id: "com", title: "Commercial services", line: "", keys: COMMERCIAL_KEYS },
  { id: "typ", title: "Service types", line: "", keys: SERVICE_TYPE_KEYS },
  { id: "area", title: "Service areas", line: "", keys: AREA_KEYS },
];

export type StepKeys = Record<StepId | ProtectedId, string[]>;

// The keys on screen, per step, in each step's order. An allowlisted key no step names goes under
// Business, so adding one to the allowlist can never lose its field.
export function keysByStep(shown: readonly string[]): StepKeys {
  const present = new Set(shown);
  const out = {} as StepKeys;
  const placed = new Set<string>();
  for (const step of [...STEPS, ...PROTECTED_STEPS]) {
    out[step.id] = step.keys.filter((key) => present.has(key));
    for (const key of step.keys) placed.add(key);
  }
  out.biz.push(...shown.filter((key) => !placed.has(key)));
  return out;
}

export const filledCount = (keys: readonly string[], values: Readonly<Record<string, string>>) =>
  keys.filter((key) => (values[key] ?? "").trim() !== "").length;

// A saved value the draft empties. These need the review step before a save.
export const clearedKeys = (keys: readonly string[], values: Readonly<Record<string, string>>, draft: Readonly<Record<string, string>>) =>
  keys.filter((key) => (values[key] ?? "").trim() !== "" && (draft[key] ?? "").trim() === "");
