import type { ImageKind } from "../types";
import { BACKGROUND_KEY, SVG_IMAGE_KEYS } from "./field-groups";
import { OUR_WORK_KEYS } from "./folder-keys";
import { placeKey } from "./layout";

const PHOTO_KEYS: ReadonlySet<string> = new Set([BACKGROUND_KEY, ...OUR_WORK_KEYS]);

// A key whose value is an image link, by the last part of its name: logo, favicon, background, image,
// photo, picture, banner, hero (partner logos, review photos, team photos and the like), with an
// optional `_url` or `_src` after it, or a `_before_`/`_after_` photo. Not `_link` (a button or page
// link such as `hero_link`) and not `bg` (often a color such as `section_bg`).
const IMAGE_NAME = /(^|_)(logo|favicon|background|image|img|photo|picture|pic|banner|hero|thumbnail|avatar|headshot)(_url|_src)?$|_(before|after)_(image|img|photo|picture)$/i;

// The one rule for "this key holds an image", shared by the preview, the picker and the server's
// image route, so the page and the server always agree.
export const isImageKey = (key: string): boolean => SVG_IMAGE_KEYS.has(key) || PHOTO_KEYS.has(key) || IMAGE_NAME.test(key);

// Which image a field takes, or null for a field that is not an image. "svg": the logo and favicon,
// which take an SVG; "photo": every other image, compressed in the browser. A non-SVG logo already in
// the account keeps working.
export function imageKindOf(key: string): ImageKind | null {
  if (SVG_IMAGE_KEYS.has(key)) return "svg";
  return isImageKey(key) ? "photo" : null;
}

// Whether the logo and favicon may also take a photo (compressed to WebP) besides an SVG. Decided by
// the user (2026-11-24), but off until the two tests that pin SVG-only for them are changed with the
// user's approval: "offers SVG only on the logo" (image-change.test.tsx) and "requires an SVG for the
// logo and favicon" (media-route.test.ts). The page and the server both read this one value.
export const LOGO_ACCEPTS_PHOTO = false;

// The HighLevel media library folder a new image for `key` goes into when the key holds no library
// file yet: the HighLevel name of the layout folder the key shows in. Null: that folder has no
// recorded HighLevel name, so the file goes to the top of the library.
export function mediaFolderOf(key: string): string | null {
  return placeKey(key)?.folder.highLevelName ?? null;
}
