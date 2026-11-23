// Minimal WebP headers for the byte checks. They are not decodable images.
export function riff(fourCc: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(20 + payload.length);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, out.length - 8, true);
  out.set(new TextEncoder().encode("WEBP"), 8);
  out.set(new TextEncoder().encode(fourCc), 12);
  view.setUint32(16, payload.length, true);
  out.set(payload, 20);
  return out;
}

export function lossy(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(16);
  payload.set([0x9d, 0x01, 0x2a], 3);
  const view = new DataView(payload.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return riff("VP8 ", payload);
}

export function lossless(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(16);
  payload[0] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  new DataView(payload.buffer).setUint32(1, bits >>> 0, true);
  return riff("VP8L", payload);
}

export function vp8x(width: number, height: number, flags = 0): Uint8Array {
  const payload = new Uint8Array(16);
  payload[0] = flags;
  const w = width - 1;
  const h = height - 1;
  payload.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 4);
  return riff("VP8X", payload);
}
