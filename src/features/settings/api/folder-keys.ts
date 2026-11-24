// Plain labels for the numbered custom value keys every client made from the snapshot has (key
// catalogue in docs/tenant-branding.md). Which keys show is decided by the classifier
// (allowlist.ts) and where they show by the layout (layout.ts); this file only names them.
const numbers = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const pad = (n: number) => String(n).padStart(2, "0");
// Keys in this catalogue are written both ways across its folders, so 1 to 9 accept 01 to 09 too.
const spellings = (n: number) => (n < 10 ? [String(n), pad(n)] : [String(n)]);

export const SOCIAL_KEYS: readonly string[] = ["business_facebook_url", "business_instagram_url", "business_yelp_url", "business_youtube_url"];
const SOCIAL_LABELS: Readonly<Record<string, string>> = { business_facebook_url: "Facebook", business_instagram_url: "Instagram", business_yelp_url: "Yelp", business_youtube_url: "YouTube" };

// The our-work image keys the snapshot can hold; used for image previews, Change image and link rules.
export const OUR_WORK_KEYS: readonly string[] = numbers(1, 99).flatMap((n) =>
  spellings(n).flatMap((s) => [`${s}_our_work_before`, `${s}_our_work_after`]),
);

// `content` is a page's HTML article, `path` its URL slug. Both show as plain text only.
const PART_LABELS: Readonly<Record<string, string>> = { content: "page text", path: "page address" };
export const PAGE_TEXT_KEY = /(content|path)$/;

const SERVICE_NAMES: [RegExp, string][] = [
  [/^residentialservice0*(\d+)(content|path)?$/, "Residential service"],
  [/^commercialservice0*(\d+)(content|path)?$/, "Commercial service"],
  [/^servicetype0*(\d+)(content|path)?$/, "Service type"],
  [/^bizarea0*(\d+)(content|path)?$/, "Service area"],
];

const withPart = (name: string, part: string | undefined) => (part ? `${name}, ${PART_LABELS[part]}` : name);

// The plain label of one of these keys, or null for any other key.
export function folderKeyLabel(key: string): string | null {
  if (Object.hasOwn(SOCIAL_LABELS, key)) return SOCIAL_LABELS[key];
  const main = /^bizarea0+main(city|county)(content|path)?$/.exec(key);
  if (main) return withPart(`Main service ${main[1]}`, main[2]);
  const intro = /^(residential|commercial)service0+content$/.exec(key);
  if (intro) return `${intro[1] === "residential" ? "Residential" : "Commercial"} services, page text`;
  const work = /^0*(\d+)_our_work_(before|after)$/.exec(key);
  if (work) return `Project ${Number(work[1])}, ${work[2]}`;
  for (const [pattern, name] of SERVICE_NAMES) {
    const hit = pattern.exec(key);
    if (hit) return withPart(`${name} ${Number(hit[1])}`, hit[2]);
  }
  return null;
}
