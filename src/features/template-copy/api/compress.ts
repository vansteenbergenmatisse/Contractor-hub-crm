// Server-side twin of Settings' prepare-image.ts ladder: longest side at most 2400 px, WebP, the
// first quality and size step that fits in 2 MB. sharp is loaded on first use, so no page bundle
// pulls it in.
export const MAX_SIDE = 2400;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const QUALITIES = [86, 76, 66, 56, 46];
const SHRINK_STEPS = [1, 0.8, 0.64, 0.5];
const MAX_INPUT_PIXELS = 100_000_000;
const RASTER_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff", "heif"]);

export type Compressed = { bytes: Uint8Array; width: number; height: number };

// Null when the bytes are not a raster image sharp can read, or cannot be made small enough.
export async function compressToWebp(input: Uint8Array): Promise<Compressed | null> {
  try {
    const { default: sharp } = await import("sharp");
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !RASTER_FORMATS.has(meta.format) || !meta.width || !meta.height) return null;
    // An animated GIF or WebP keeps every frame (sizes then apply per frame).
    const animated = (meta.pages ?? 1) > 1;
    for (const step of SHRINK_STEPS) {
      const side = Math.max(1, Math.round(MAX_SIDE * step));
      for (const quality of QUALITIES) {
        const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated })
          .rotate()
          .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
          .webp({ quality })
          .toBuffer({ resolveWithObject: true });
        if (data.byteLength <= MAX_IMAGE_BYTES) return { bytes: new Uint8Array(data), width: info.width, height: animated && info.pageHeight ? info.pageHeight : info.height };
      }
    }
    return null;
  } catch {
    console.error("Template copy image failed: step=compress");
    return null;
  }
}
