// The server's own look at an uploaded photo. It reads the WebP container from the real bytes and
// trusts no name or type from the browser. Every chunk is walked and only the still-image layouts a
// browser canvas writes are accepted: one VP8 or VP8L frame, alone or as VP8X + optional ICCP +
// optional ALPH + frame. Chrome's canvas output was checked: VP8X, ICCP, (ALPH,) VP8 or VP8L.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 2400;
const MIN_HEADER = 30;
const FIRST_CHUNK = 12;
const CHUNK_HEADER = 8;
const MAX_CHUNKS = 4;
const VP8X_SIZE = 10;
const VP8_HEADER = 10;
const VP8L_HEADER = 5;
const FLAG_ICC = 0x20;
const FLAG_ALPHA = 0x10;
// sRGB canvas output carries a 456-byte profile. The cap keeps this chunk from carrying a payload.
const MAX_ICC_BYTES = 4096;
const MIN_ICC_BYTES = 128;
const ICC_SIGNATURE_AT = 36;

export type WebpCheck = { ok: true; width: number; height: number } | { ok: false; reason: "too_large" | "wrong_type" | "dimensions" };
type Size = { width: number; height: number };
type Chunk = { id: string; start: number; size: number };

const WRONG: WebpCheck = { ok: false, reason: "wrong_type" };
const text = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
const u24 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);

// Null unless the chunks fill the file exactly, each inside the bounds, with a zero pad after an odd size.
function readChunks(bytes: Uint8Array, view: DataView): Chunk[] | null {
  const chunks: Chunk[] = [];
  let at = FIRST_CHUNK;
  while (at < bytes.byteLength) {
    if (chunks.length === MAX_CHUNKS || at + CHUNK_HEADER > bytes.byteLength) return null;
    const size = view.getUint32(at + 4, true);
    const start = at + CHUNK_HEADER;
    const end = start + size;
    if (end > bytes.byteLength) return null;
    if (size % 2 === 1 && (end >= bytes.byteLength || bytes[end] !== 0)) return null;
    chunks.push({ id: text(bytes, at), start, size });
    at = end + (size % 2);
  }
  return chunks;
}

function frameSize(bytes: Uint8Array, view: DataView, { id, start, size }: Chunk): Size | null {
  if (id === "VP8 ") {
    if (size < VP8_HEADER || (bytes[start] & 1) !== 0) return null;
    if (bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) return null;
    return { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff };
  }
  if (id === "VP8L") {
    if (size < VP8L_HEADER || bytes[start] !== 0x2f) return null;
    const bits = view.getUint32(start + 1, true);
    if (bits >>> 29 !== 0) return null;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function isIccProfile(bytes: Uint8Array, view: DataView, { start, size }: Chunk): boolean {
  if (size < MIN_ICC_BYTES || size > MAX_ICC_BYTES) return false;
  return view.getUint32(start, false) === size && text(bytes, start + ICC_SIGNATURE_AT) === "acsp";
}

function extendedSize(bytes: Uint8Array, view: DataView, chunks: readonly Chunk[]): Size | null {
  const [head] = chunks;
  if (head.size !== VP8X_SIZE) return null;
  const flags = bytes[head.start];
  // Animation, EXIF, XMP and the reserved bits are all refused.
  if ((flags & ~(FLAG_ICC | FLAG_ALPHA)) !== 0 || u24(bytes, head.start + 1) !== 0) return null;
  let next = 1;
  const icc = chunks[next]?.id === "ICCP" ? chunks[next++] : null;
  if (Boolean(flags & FLAG_ICC) !== Boolean(icc) || (icc && !isIccProfile(bytes, view, icc))) return null;
  const alpha = chunks[next]?.id === "ALPH" ? chunks[next++] : null;
  if (alpha && (alpha.size === 0 || !(flags & FLAG_ALPHA))) return null;
  const image = chunks[next];
  if (!image || next !== chunks.length - 1 || (alpha && image.id !== "VP8 ")) return null;
  const frame = frameSize(bytes, view, image);
  if (!frame) return null;
  const canvas = { width: u24(bytes, head.start + 4) + 1, height: u24(bytes, head.start + 7) + 1 };
  return frame.width === canvas.width && frame.height === canvas.height ? canvas : null;
}

function sizeOf(bytes: Uint8Array, view: DataView): Size | null {
  const chunks = readChunks(bytes, view);
  if (!chunks || chunks.length === 0) return null;
  if (chunks[0].id === "VP8X") return extendedSize(bytes, view, chunks);
  return chunks.length === 1 ? frameSize(bytes, view, chunks[0]) : null;
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
