import { MAX_IMAGE_BYTES, MAX_IMAGE_SIDE } from "./webp-check";

// The server's own look at a PNG or JPEG from the browser's canvas. It walks the real file structure,
// trusts no name or type, and refuses extra data, metadata chunks and anything after the image's end.
export type RasterCheck = { ok: true; width: number; height: number } | { ok: false; reason: "too_large" | "wrong_type" | "dimensions" };

const WRONG: RasterCheck = { ok: false, reason: "wrong_type" };
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CHUNKS: ReadonlySet<string> = new Set(["PLTE", "tRNS", "sRGB", "gAMA", "cHRM", "iCCP", "pHYs", "IDAT"]);
const MAX_PNG_CHUNKS = 4096;
const MAX_PROFILE_BYTES = 4096;
const JPEG_FRAMES: ReadonlySet<number> = new Set([0xc0, 0xc1, 0xc2]);
const JPEG_SEGMENTS: ReadonlySet<number> = new Set([0xe0, 0xe2, 0xdb, 0xc4, 0xdd]);
const MAX_JPEG_SEGMENTS = 512;

const sized = (width: number, height: number): RasterCheck =>
  width < 1 || height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE ? { ok: false, reason: "dimensions" } : { ok: true, width, height };

export const isPng = (bytes: Uint8Array) => PNG_SIGNATURE.every((value, i) => bytes[i] === value);
export const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

export function checkPng(bytes: Uint8Array): RasterCheck {
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  if (!isPng(bytes) || bytes.byteLength < 45) return WRONG;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = PNG_SIGNATURE.length;
  let size: RasterCheck | null = null;
  let frames = 0;
  for (let count = 0; count < MAX_PNG_CHUNKS; count += 1) {
    if (at + 12 > bytes.byteLength) return WRONG;
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const end = at + 12 + length;
    if (end > bytes.byteLength) return WRONG;
    if (count === 0) {
      if (type !== "IHDR" || length !== 13) return WRONG;
      size = sized(view.getUint32(at + 8), view.getUint32(at + 12));
    } else if (type === "IEND") {
      if (length !== 0 || end !== bytes.byteLength || frames === 0 || !size) return WRONG;
      return size;
    } else if (!PNG_CHUNKS.has(type)) return WRONG;
    else if (type === "iCCP" && length > MAX_PROFILE_BYTES) return WRONG;
    else if (type === "IDAT") frames += 1;
    at = end;
  }
  return WRONG;
}

// The entropy-coded data after a scan header, up to the next real marker.
function skipScan(bytes: Uint8Array, start: number): number {
  for (let at = start; at + 1 < bytes.byteLength; at += 1) {
    if (bytes[at] !== 0xff) continue;
    const next = bytes[at + 1];
    if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) return at;
  }
  return -1;
}

export function checkJpeg(bytes: Uint8Array): RasterCheck {
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  if (!isJpeg(bytes) || bytes.byteLength < 20) return WRONG;
  let at = 2;
  let size: RasterCheck | null = null;
  let scans = 0;
  for (let count = 0; count < MAX_JPEG_SEGMENTS; count += 1) {
    if (at + 2 > bytes.byteLength || bytes[at] !== 0xff) return WRONG;
    const marker = bytes[at + 1];
    if (marker === 0xd9) return at + 2 === bytes.byteLength && size && scans > 0 ? size : WRONG;
    if (at + 4 > bytes.byteLength) return WRONG;
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    const end = at + 2 + length;
    if (length < 2 || end > bytes.byteLength) return WRONG;
    if (JPEG_FRAMES.has(marker)) {
      if (size || length < 8) return WRONG;
      size = sized((bytes[at + 7] << 8) | bytes[at + 8], (bytes[at + 5] << 8) | bytes[at + 6]);
      at = end;
    } else if (marker === 0xda) {
      if (!size) return WRONG;
      scans += 1;
      at = skipScan(bytes, end);
      if (at < 0) return WRONG;
    } else if (JPEG_SEGMENTS.has(marker)) {
      if (marker === 0xe2 && length > MAX_PROFILE_BYTES) return WRONG;
      at = end;
    } else return WRONG;
  }
  return WRONG;
}
