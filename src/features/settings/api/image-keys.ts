import type { ImageKind } from "../types";
import { BACKGROUND_KEY, SVG_IMAGE_KEYS } from "./field-groups";
import { OUR_WORK_KEYS } from "./folder-keys";

const PHOTO_KEYS: ReadonlySet<string> = new Set([BACKGROUND_KEY, ...OUR_WORK_KEYS]);

// Which image a field takes in Change image, or null for a field that is not an image. The logo and
// favicon take SVG for new uploads; a non-SVG logo already in the account keeps working.
export function imageKindOf(key: string): ImageKind | null {
  if (SVG_IMAGE_KEYS.has(key)) return "svg";
  return PHOTO_KEYS.has(key) ? "photo" : null;
}
