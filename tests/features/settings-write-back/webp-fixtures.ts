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

// Any chunk list, with the even-size padding the RIFF format requires.
export function container(chunks: readonly (readonly [string, Uint8Array])[]): Uint8Array {
  const total = chunks.reduce((sum, [, data]) => sum + 8 + data.length + (data.length & 1), 12);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const encoder = new TextEncoder();
  out.set(encoder.encode("RIFF"), 0);
  view.setUint32(4, total - 8, true);
  out.set(encoder.encode("WEBP"), 8);
  let at = 12;
  for (const [id, data] of chunks) {
    out.set(encoder.encode(id), at);
    view.setUint32(at + 4, data.length, true);
    out.set(data, at + 8);
    at += 8 + data.length + (data.length & 1);
  }
  return out;
}

export const vp8Frame = (width: number, height: number) => lossy(width, height).slice(20);
export const vp8lFrame = (width: number, height: number) => lossless(width, height).slice(20);

export function vp8xHeader(width: number, height: number, flags = 0): Uint8Array {
  const payload = new Uint8Array(10);
  payload[0] = flags;
  const w = width - 1;
  const h = height - 1;
  payload.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 4);
  return payload;
}

// The smallest shape of an ICC profile the check reads: its size and the `acsp` signature.
export function iccProfile(size = 128): Uint8Array {
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(new TextEncoder().encode("acsp"), 36);
  return out;
}

export function vp8x(width: number, height: number, flags = 0): Uint8Array {
  return container([["VP8X", vp8xHeader(width, height, flags)], ["VP8 ", vp8Frame(width, height)]]);
}

// Real output of canvas.toDataURL("image/webp", quality) in headless Chrome, 8 by 6 pixels. Chrome writes
// VP8X + ICCP, then ALPH + VP8 (lossy with alpha) or VP8 / VP8L.
export const CHROME_WEBP: readonly (readonly [string, string])[] = [
  ["opaque 0.86", "UklGRiYCAABXRUJQVlA4WAoAAAAgAAAABwAABQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggOAAAALABAJ0BKggABgABABolqAJ0ugAFAgAA/rSFNDTf/kT7b7VP5gk/RZ//y4h32jd4mv/jr/ZAAAAA"],
  ["opaque 1", "UklGRnACAABXRUJQVlA4WAoAAAAgAAAABwAABQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhMgQAAAC8HQAEAX8GgbSNJO/xxLMvd+B4SDNo2kpzbWed+LIegbdvkVM+fwur5r8P+//Md5Z4nCEEyYebJgAgzCRDWBCD8gQizkpl52tQQEURglHsNnPeAYQCAKcPrbt1ME9H/AIgqV7YLJMIWzZQxN7EetpPpUPXr8UhfdvN+fzY1Y77eHwA="],
  ["alpha 0.86", "UklGRj4CAABXRUJQVlA4WAoAAAAwAAAABwAABQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIGQAAAAEXMEAREYaCtm2Y7h90hVjYEf0PgKXXswAAVlA4IC4AAADQAQCdASoIAAYAAQAaJagCdEcAfwAEgAD+96KX44FG+DhGf/rgTmO//q0UB0AA"],
  ["alpha 1", "UklGRhACAABXRUJQVlA4WAoAAAAwAAAABwAABQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhMIQAAAC8HQAEQFzAUczwUAxTwCAVt2zDdP+gKsbAj+h8AS69nAQA="],
];
