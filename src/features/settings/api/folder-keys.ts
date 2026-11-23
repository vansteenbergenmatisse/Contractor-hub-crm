// The numbered custom value keys every client made from the JCR snapshot has (key catalogue in
// docs/tenant-branding.md). Exact lists, never a prefix, so `*content` (HTML articles), `*path`,
// `0_*` and anything else stay out. No imports: the allowlist reads this file while it loads.
const numbers = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const pad = (n: number) => String(n).padStart(2, "0");
// Keys in this catalogue are written both ways across its folders, so 1 to 9 accept 01 to 09 too.
const spellings = (n: number) => (n < 10 ? [String(n), pad(n)] : [String(n)]);

export const SOCIAL_KEYS: readonly string[] = ["business_facebook_url", "business_instagram_url", "business_yelp_url", "business_youtube_url"];
const SOCIAL_LABELS: Readonly<Record<string, string>> = { business_facebook_url: "Facebook", business_instagram_url: "Instagram", business_yelp_url: "Yelp", business_youtube_url: "YouTube" };

export const RESIDENTIAL_KEYS: readonly string[] = numbers(1, 20).map((n) => `residentialservice${n}`);
export const COMMERCIAL_KEYS: readonly string[] = numbers(1, 20).map((n) => `commercialservice${n}`);
export const SERVICE_TYPE_KEYS: readonly string[] = numbers(1, 10).map((n) => `servicetype${pad(n)}`);
// The catalogue marks this spelling as read from a small screenshot. A key the account lacks shows nothing.
export const AREA_KEYS: readonly string[] = [
  "bizarea00maincity",
  "bizarea00maincounty",
  ...numbers(1, 21).flatMap((n) => spellings(n).map((s) => `bizarea${s}`)),
];
export const OUR_WORK_KEYS: readonly string[] = numbers(1, 99).flatMap((n) =>
  spellings(n).flatMap((s) => [`${s}_our_work_before`, `${s}_our_work_after`]),
);

export const FOLDER_VALUE_KEYS: readonly string[] = [...SOCIAL_KEYS, ...RESIDENTIAL_KEYS, ...COMMERCIAL_KEYS, ...SERVICE_TYPE_KEYS, ...AREA_KEYS, ...OUR_WORK_KEYS];

// The plain label of one of these keys, or null for any other key.
export function folderKeyLabel(key: string): string | null {
  if (Object.hasOwn(SOCIAL_LABELS, key)) return SOCIAL_LABELS[key];
  if (key === "bizarea00maincity") return "Main service city";
  if (key === "bizarea00maincounty") return "Main service county";
  const work = /^0?(\d+)_our_work_(before|after)$/.exec(key);
  if (work && OUR_WORK_KEYS.includes(key)) return `Project ${work[1]}, ${work[2]}`;
  const lists: [readonly string[], RegExp, string][] = [
    [RESIDENTIAL_KEYS, /^residentialservice(\d+)$/, "Residential service"],
    [COMMERCIAL_KEYS, /^commercialservice(\d+)$/, "Commercial service"],
    [SERVICE_TYPE_KEYS, /^servicetype(\d+)$/, "Service type"],
    [AREA_KEYS, /^bizarea(\d+)$/, "Service area"],
  ];
  for (const [list, pattern, name] of lists) {
    const hit = pattern.exec(key);
    if (hit && list.includes(key)) return `${name} ${Number(hit[1])}`;
  }
  return null;
}
