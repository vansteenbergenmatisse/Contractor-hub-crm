// The Settings layout: which HighLevel folder each custom value key belongs to, and the sub-groups
// inside a folder. HighLevel's API returns no folder for a custom value, so this file is the only
// source of the grouping. It was written by Claude (an AI) on 2026-11-24 from the key catalogue in
// docs/tenant-branding.md and the folder list of a sub-account made from the snapshot
// "Landscaping Core v2.0" (16 folders, 320 values). When keys change, re-run the grouping as
// described in docs/settings-layout.md. No AI call happens in the app.
//
// This file decides only WHERE a key shows. It never decides whether a key may reach the browser or
// be written: that is the classifier in allowlist.ts, run on the server first.
//
// Matching order for one key: (1) an exact key of any folder, (2) the `patterns` and `repeat` rules
// in file order, (3) the `fallback` patterns in file order, (4) the catch-all folder below.
// Lines marked GUESS name keys or folders not seen in a real account.

export type LayoutGroup = {
  id: string;
  // Humanised. A repeating group puts the item number in place of {n}.
  title: string;
  keys?: readonly string[];
  patterns?: readonly RegExp[];
  // One sub-group per item number: the first capture is the number, the optional second capture the
  // part (for example "content"). `parts` orders the parts inside an item; "" is the bare key.
  repeat?: { pattern: RegExp; parts: readonly string[] };
  fallback?: readonly RegExp[];
};

export type LayoutFolder = {
  // Also the step id on the page (`s-card-<id>`).
  id: string;
  title: string;
  // The folder's name in HighLevel. Data only: never shown to the owner.
  highLevelName: string | null;
  line: string;
  // Opens only behind the extra unlock step (ProtectedFolder).
  protected?: true;
  groups: readonly LayoutGroup[];
};

const SERVICE_PARTS = ["", "path", "content"] as const;

export const LAYOUT: readonly LayoutFolder[] = [
  {
    id: "biz",
    title: "Business",
    highLevelName: "01_Business_essentials(NAP+logo+email)",
    line: "Who you are, where you work and how customers reach you.",
    groups: [
      {
        id: "contact",
        title: "Name and contact",
        keys: ["business_name", "business_owner_name", "business_phone_number", "business_email", "business_website_url", "business_main_keyword"],
      },
      {
        id: "address",
        title: "Address",
        keys: [
          "business_address", "business_full_address", "business_address_city", "business_address_state",
          "business_main_city", "business_main_county", "business_main_state_abbreviation",
          "business_latitude", "business_longitude",
        ],
        patterns: [/^business_(address|full_address|main_(city|county|state|zip|postal)|zip|postal|latitude|longitude)/],
      },
      {
        id: "hours",
        title: "Hours",
        keys: [
          "business_hours",
          "business_hours_weekdays_open", "business_hours_weekdays_close",
          "business_hours_saturday_open", "business_hours_saturday_close",
          "business_hours_sunday_open", "business_hours_sunday_close",
        ],
        patterns: [/^business_hours/],
      },
      {
        id: "images",
        title: "Logo and images",
        keys: ["business_logo", "business_favicon_url", "business_main_background_video_or_image"],
        patterns: [/^business_.*(logo|favicon|image|photo|video)/],
      },
      { id: "cta", title: "Call to action", keys: ["universal_cta"], patterns: [/(^|_)cta(_|$)/] },
      // GUESS: the offer texts sit in Business essentials (the catalogue lists them with it; the
      // folder has keys on a second page that were never seen).
      { id: "offers", title: "Offers", keys: ["referral_reward_text", "seasonal_offer_text"], patterns: [/_offer_text$|_reward_text$/] },
      // Any other business_* key, so a new key in this folder lands here and not in the catch-all.
      { id: "more-business", title: "More business details", fallback: [/^business_/] },
    ],
  },
  {
    id: "soc",
    title: "Social links",
    highLevelName: "01a_Social_Links",
    line: "Links to your social pages.",
    groups: [
      {
        id: "social",
        title: "Social pages",
        keys: ["business_facebook_url", "business_instagram_url", "business_yelp_url", "business_youtube_url"],
        // GUESS: other networks a snapshot could add.
        patterns: [/^business_(facebook|instagram|yelp|youtube|tiktok|linkedin|twitter|x|pinterest|nextdoor|houzz|angi|thumbtack|google_my_business)_url$/],
      },
    ],
  },
  {
    id: "gbp",
    title: "Google Business Profile",
    highLevelName: "01b_Google_Business_Profile",
    line: "Your Google profile and review links.",
    groups: [
      {
        id: "google",
        title: "Profile and review links",
        keys: ["business_google_profile_url", "google_review_request_url", "bbb_review_request_url"],
        patterns: [/^(business_)?google_/, /^bbb_/, /_review_request_url$/],
      },
    ],
  },
  {
    id: "book",
    title: "Booking links",
    highLevelName: "01c_booking_links",
    line: "Where customers ask for a job or a quote.",
    groups: [
      { id: "booking", title: "Booking links", keys: ["request_a_job_booking_link", "request_a_quote_booking_link"], patterns: [/booking/] },
    ],
  },
  {
    id: "col",
    title: "Brand colors",
    highLevelName: "02_Branding",
    line: "The colors of your dashboard and website.",
    // Same keys and order as COLOR_GROUPS in fields.ts (a test pins them together).
    groups: [
      { id: "main", title: "Main color", keys: ["main_color", "main_hover_color", "main_light_color", "main_background_color", "main_border_color"] },
      { id: "second", title: "Second color and status colors", keys: ["sub_color", "highlight_color", "error_color"] },
      { id: "backgrounds", title: "Backgrounds and borders", keys: ["background_color", "section_background_color", "border_color"] },
      { id: "text", title: "Text", keys: ["text_color", "light_text_color", "text_on_main_color"] },
      // GUESS: the catalogue says this folder has no font keys today; any later one lands here.
      { id: "more-branding", title: "More branding", fallback: [/_color$/, /font/] },
    ],
  },
  {
    id: "res",
    title: "Residential services",
    highLevelName: "03.1_Residential_Services",
    line: "The services you offer homeowners. Each one builds a page on your website.",
    protected: true,
    groups: [
      { id: "intro", title: "Services page", patterns: [/^residentialservice0+content$/] },
      { id: "service", title: "Residential service {n}", repeat: { pattern: /^residentialservice0*([1-9]\d*)(content|path)?$/, parts: SERVICE_PARTS } },
    ],
  },
  {
    id: "com",
    title: "Commercial services",
    highLevelName: "03.2_Commercial_Services",
    line: "The services you offer businesses. Each one builds a page on your website.",
    protected: true,
    groups: [
      { id: "intro", title: "Services page", patterns: [/^commercialservice0+content$/] },
      { id: "service", title: "Commercial service {n}", repeat: { pattern: /^commercialservice0*([1-9]\d*)(content|path)?$/, parts: SERVICE_PARTS } },
    ],
  },
  {
    id: "typ",
    title: "Service types",
    highLevelName: "04_Service-Types",
    line: "The kinds of work you do. Each one builds a page on your website.",
    protected: true,
    // `0_servicetypename` (the folder's title) never shows: the classifier hides every 0_ key.
    groups: [
      { id: "type", title: "Service type {n}", repeat: { pattern: /^servicetype0*([1-9]\d*)(content|path)?$/, parts: SERVICE_PARTS } },
    ],
  },
  {
    id: "area",
    title: "Service areas",
    highLevelName: "05_Service-Areas-(cities)",
    line: "The cities and county you work in. Each one builds a page on your website.",
    protected: true,
    groups: [
      // The catalogue read these spellings from a small screenshot, so both word orders are taken
      // (`bizarea00maincity` and `bizarea00citymain`).
      { id: "main", title: "Main city and county", patterns: [/^bizarea0+(main(city|county)|(city|county)main)(content|path)?$/] },
      { id: "area", title: "Service area {n}", repeat: { pattern: /^bizarea0*([1-9]\d*)(content|path)?$/, parts: SERVICE_PARTS } },
    ],
  },
  // GUESS (the whole folder): the key names of 07.1_Sections_Partners were never seen. Seven values,
  // read as a section title plus a name, logo and link per partner.
  {
    id: "partners",
    title: "Partners",
    highLevelName: "07.1_Sections_Partners",
    line: "The partners and brands shown on your website.",
    groups: [
      { id: "section", title: "Partners section", patterns: [/^(section_)?partners?_(section_)?(title|heading|subheading|subtitle|intro|text|description)$/] },
      {
        id: "partner",
        title: "Partner {n}",
        repeat: { pattern: /^(?:section_)?partners?_?0*(\d+)(?:_(name|title|logo|image|link|url|text|description))?$/, parts: ["", "name", "title", "logo", "image", "link", "url", "text", "description"] },
      },
      { id: "more-partners", title: "More about partners", fallback: [/partner/] },
    ],
  },
  // GUESS (the whole folder): the key names of 07.2_Sections_Reviews were never seen. Eighteen
  // values, read as a name, text and star rating for six reviews.
  {
    id: "reviews",
    title: "Reviews",
    highLevelName: "07.2_Sections_Reviews",
    line: "The customer reviews shown on your website.",
    groups: [
      { id: "section", title: "Reviews section", patterns: [/^(section_)?reviews?_(section_)?(title|heading|subheading|subtitle|intro)$/] },
      {
        id: "review",
        title: "Review {n}",
        repeat: { pattern: /^(?:section_)?(?:customer_)?reviews?_?0*(\d+)(?:_(name|author|location|city|text|body|quote|stars|rating|date|photo|image))?$/, parts: ["", "name", "author", "location", "city", "text", "body", "quote", "stars", "rating", "date", "photo", "image"] },
      },
      // `google_review_request_url` and `bbb_review_request_url` are matched by the Google folder first.
      { id: "more-reviews", title: "More about reviews", fallback: [/review|testimonial/] },
    ],
  },
  // GUESS: two of the four folders Matt did not name are taken to be more website sections
  // (07.3 and 07.4). Their names and keys are not known; these rules only catch keys if they exist.
  {
    id: "faq",
    title: "Questions and answers",
    highLevelName: null,
    line: "Common questions and their answers on your website.",
    groups: [
      { id: "faq", title: "Question {n}", repeat: { pattern: /^(?:section_)?faqs?_?0*(\d+)(?:_(question|answer|q|a))?$/, parts: ["", "question", "q", "answer", "a"] } },
      { id: "more-faq", title: "More about questions", fallback: [/faq/] },
    ],
  },
  {
    id: "team",
    title: "Team",
    highLevelName: null,
    line: "The people shown on your website.",
    groups: [
      { id: "member", title: "Team member {n}", repeat: { pattern: /^(?:section_)?team(?:_member)?_?0*(\d+)(?:_(name|role|title|photo|image|bio|text))?$/, parts: ["", "name", "role", "title", "photo", "image", "bio", "text"] } },
      { id: "more-team", title: "More about your team", fallback: [/(^|_)team(_|$)/] },
    ],
  },
  {
    id: "work",
    title: "Our work",
    highLevelName: "07.5_Our-work",
    line: "Before and after photos of your projects.",
    groups: [
      { id: "project", title: "Project {n}", repeat: { pattern: /^0*(\d+)_our_work_(before|after)$/, parts: ["before", "after"] } },
      { id: "more-work", title: "More about your work", fallback: [/our_work/] },
    ],
  },
];

// Keys no rule above places. Humanised; never "Other values" (a test forbids that name).
export const CATCH_ALL: LayoutFolder = {
  id: "more",
  title: "More details",
  highLevelName: null,
  line: "Values in your account that have no place on this page yet.",
  groups: [{ id: "more", title: "More details" }],
};

export type Placement = { folder: LayoutFolder; group: LayoutGroup; item: number | null; part: number; rank: number };

const cache = new Map<string, Placement>();
let exact: Map<string, Placement> | null = null;

function exactPlacements(): Map<string, Placement> {
  if (exact) return exact;
  exact = new Map();
  for (const folder of LAYOUT) {
    for (const group of folder.groups) {
      (group.keys ?? []).forEach((key, i) => exact!.set(key, { folder, group, item: null, part: 0, rank: i }));
    }
  }
  return exact;
}

function byRules(key: string, rule: "patterns" | "fallback"): Placement | null {
  for (const folder of LAYOUT) {
    for (const group of folder.groups) {
      if (rule === "patterns" && group.repeat) {
        const hit = group.repeat.pattern.exec(key);
        if (hit) {
          const part = group.repeat.parts.indexOf(hit[2] ?? "");
          return { folder, group, item: Number(hit[1]), part: part === -1 ? group.repeat.parts.length : part, rank: Number.MAX_SAFE_INTEGER };
        }
      }
      if ((group[rule] ?? []).some((p) => p.test(key))) return { folder, group, item: null, part: 0, rank: Number.MAX_SAFE_INTEGER };
    }
  }
  return null;
}

// Where `key` shows. Null: no rule places it, so it goes to the catch-all folder.
// The cache is shared by every tenant on this server, so it stops growing at CACHE_LIMIT keys.
const CACHE_LIMIT = 5_000;
export function placeKey(key: string): Placement | null {
  const known = cache.get(key);
  if (known) return known;
  const found = exactPlacements().get(key) ?? byRules(key, "patterns") ?? byRules(key, "fallback");
  if (found && cache.size < CACHE_LIMIT) cache.set(key, found);
  return found;
}

export type ArrangedGroup = { id: string; title: string; keys: string[] };
export type ArrangedFolder = { folder: LayoutFolder; groups: ArrangedGroup[]; keys: string[] };

const compare = (a: [string, Placement], b: [string, Placement]) =>
  a[1].rank - b[1].rank || (a[1].item ?? 0) - (b[1].item ?? 0) || a[1].part - b[1].part || a[0].localeCompare(b[0]);

// The folders that hold any of `keys`, in layout order with the catch-all last, each with its
// sub-groups in order. A repeating group gives one sub-group per item number, in number order.
export function arrangeKeys(keys: readonly string[]): ArrangedFolder[] {
  const placed = new Map<LayoutFolder, Map<LayoutGroup, [string, Placement][]>>();
  const rest: string[] = [];
  for (const key of new Set(keys)) {
    const at = placeKey(key);
    if (!at) { rest.push(key); continue; }
    const groups = placed.get(at.folder) ?? new Map<LayoutGroup, [string, Placement][]>();
    placed.set(at.folder, groups);
    groups.set(at.group, [...(groups.get(at.group) ?? []), [key, at]]);
  }
  const out: ArrangedFolder[] = [];
  for (const folder of LAYOUT) {
    const groups = placed.get(folder);
    if (!groups) continue;
    const shown: ArrangedGroup[] = [];
    for (const group of folder.groups) {
      const own = (groups.get(group) ?? []).sort(compare);
      if (own.length === 0) continue;
      if (!group.repeat) { shown.push({ id: group.id, title: group.title, keys: own.map(([k]) => k) }); continue; }
      const items = new Map<number, string[]>();
      for (const [k, at] of own) items.set(at.item ?? 0, [...(items.get(at.item ?? 0) ?? []), k]);
      for (const [n, itemKeys] of items) shown.push({ id: `${group.id}-${n}`, title: group.title.replace("{n}", String(n)), keys: itemKeys });
    }
    out.push({ folder, groups: shown, keys: shown.flatMap((g) => g.keys) });
  }
  if (rest.length > 0) {
    const sorted = [...rest].sort();
    out.push({ folder: CATCH_ALL, groups: [{ id: "more", title: CATCH_ALL.title, keys: sorted }], keys: sorted });
  }
  return out;
}

// Keys no rule places, for the server log that the next AI re-run reads (names only).
export const unplacedKeys = (keys: readonly string[]): string[] => keys.filter((key) => !placeKey(key)).sort();
