import { COLOR_KEYS } from "./fields";
import { AREA_KEYS, COMMERCIAL_KEYS, OUR_WORK_KEYS, RESIDENTIAL_KEYS, SERVICE_TYPE_KEYS, SOCIAL_KEYS } from "./folder-keys";

// HighLevel's API has no folders, so this map places each key in the folder it has in the JCR
// snapshot (docs/tenant-branding.md). `name` is the folder's name in HighLevel. `keys` fixes the
// order inside a folder. Essentials has no list: it takes every allowed key no other folder claims.
export type FolderId = "essentials" | "social" | "google" | "booking" | "branding" | "residential" | "commercial" | "service-types" | "areas" | "our-work";
export type Folder = { id: FolderId; title: string; name: string | null; keys?: readonly string[] };

export const FOLDERS: readonly Folder[] = [
  { id: "essentials", title: "Business essentials", name: "01_Business_essentials" },
  { id: "social", title: "Social links", name: "01a_Social_Links", keys: SOCIAL_KEYS },
  { id: "google", title: "Google Business Profile", name: "01b_Google_Business_Profile", keys: ["business_google_profile_url", "google_review_request_url", "bbb_review_request_url"] },
  { id: "booking", title: "Booking links", name: "01c_booking_links", keys: ["request_a_job_booking_link", "request_a_quote_booking_link"] },
  { id: "branding", title: "Branding", name: "02_Branding", keys: COLOR_KEYS },
  { id: "residential", title: "Residential services", name: "03.1_Residential_Services", keys: RESIDENTIAL_KEYS },
  { id: "commercial", title: "Commercial services", name: "03.2_Commercial_Services", keys: COMMERCIAL_KEYS },
  { id: "service-types", title: "Service types", name: "04_Service-Types", keys: SERVICE_TYPE_KEYS },
  { id: "areas", title: "Service areas", name: "05_Service-Areas-(cities)", keys: AREA_KEYS },
  { id: "our-work", title: "Our work", name: "07.5_Our-work", keys: OUR_WORK_KEYS },
];

let byKey: Map<string, Folder> | null = null;
function folderOfKey(key: string): Folder {
  byKey ??= new Map(FOLDERS.flatMap((folder) => (folder.keys ?? []).map((k) => [k, folder] as const)));
  return byKey.get(key) ?? FOLDERS[0];
}

export const folderIdOfKey = (key: string): FolderId => folderOfKey(key).id;

// Words a search can find a key's folder by.
export function folderSearchText(key: string): string {
  const { title, name } = folderOfKey(key);
  return name ? `${title} ${name}` : title;
}

export type ShownFolder = { folder: Folder; keys: string[] };

// The folders that hold any of `keys`, in folder order, each with its keys in the folder's order.
export function foldersFor(keys: readonly string[]): ShownFolder[] {
  return FOLDERS.flatMap((folder) => {
    const own = keys.filter((key) => folderOfKey(key).id === folder.id);
    if (own.length === 0) return [];
    const order = folder.keys;
    return [{ folder, keys: order ? [...own].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : own }];
  });
}
