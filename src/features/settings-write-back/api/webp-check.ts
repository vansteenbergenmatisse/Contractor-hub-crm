// The server's own look at an uploaded photo. It reads the WebP container from the real bytes and
// trusts no name or type from the browser.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 2400;
const MIN_HEADER = 30;
const ANIMATED = 0x02;

export type WebpCheck = { ok: true; width: number; height: number } | { ok: false; reason: "too_large" | "wrong_type" | "dimensions" };

const WRONG: WebpCheck = { ok: false, reason: "wrong_type" };
const text = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
const u24 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);

function sizeOf(bytes: Uint8Array, view: DataView): { width: number; height: number } | null {
  const chunk = text(bytes, 12);
  if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    if (bytes[20] & ANIMATED) return null;
    return { width: u24(bytes, 24) + 1, height: u24(bytes, 27) + 1 };
  }
  return null;
}

export function checkWebp(bytes: Uint8Array): WebpCheck {
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  if (bytes.byteLength < MIN_HEADER || text(bytes, 0) !== "RIFF" || text(bytes, 8) !== "WEBP") return WRONG;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.byteLength) return WRONG;
  const size = sizeOf(bytes, view);
  if (!size) return WRONG;
  if (size.width < 1 || size.height < 1 || Math.max(size.width, size.height) > MAX_IMAGE_SIDE) return { ok: false, reason: "dimensions" };
  return { ok: true, ...size };
}
