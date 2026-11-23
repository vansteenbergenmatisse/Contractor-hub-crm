import type { ImageKind, PreparedImage } from "../types";

// Runs in the browser, before anything is sent. The server checks everything again.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_SIDE = 2400;
export const MAX_SVG_FILE_BYTES = 512 * 1024;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const QUALITIES = [0.86, 0.76, 0.66, 0.56, 0.46];
const SHRINK_STEPS = [1, 0.8, 0.64, 0.5];

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

// The longest side at most `max`, never enlarged.
export function fitSize(width: number, height: number, max = MAX_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function prepareSvg(file: File): Promise<PreparedImage> {
  const named = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  if (!named) return { ok: false, message: "Choose an SVG file. The logo and favicon must be SVG." };
  if (file.size > MAX_SVG_FILE_BYTES) return { ok: false, message: "This SVG is over 512 KB. Choose a smaller file." };
  const blob = new Blob([await file.arrayBuffer()], { type: "image/svg+xml" });
  return { ok: true, blob, previewUrl: URL.createObjectURL(blob), summary: `SVG, ${kb(blob.size)}` };
}

const encode = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));

async function preparePhoto(file: File): Promise<PreparedImage> {
  if (file.type !== "" && !file.type.startsWith("image/")) return { ok: false, message: "Choose a photo, such as a JPG or PNG." };
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, message: "This photo is over 40 MB. Choose a smaller one." };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: "This file could not be read as a photo. Try a JPG or PNG." };
  }
  try {
    const base = fitSize(bitmap.width, bitmap.height);
    for (const step of SHRINK_STEPS) {
      const size = fitSize(base.width * step, base.height * step);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) break;
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      for (const quality of QUALITIES) {
        const blob = await encode(canvas, quality);
        // A browser without a WebP encoder quietly returns a PNG, which the server would refuse.
        if (!blob || blob.type !== "image/webp") return { ok: false, message: "This browser cannot prepare the photo. Try Chrome, Edge or Firefox." };
        if (blob.size <= MAX_PHOTO_BYTES) {
          return { ok: true, blob, previewUrl: URL.createObjectURL(blob), summary: `WebP, ${size.width} by ${size.height}, ${kb(blob.size)}` };
        }
      }
    }
    return { ok: false, message: "This photo could not be made smaller than 2 MB. Try another one." };
  } finally {
    bitmap.close();
  }
}

export function prepareImageFile(file: File, kind: ImageKind): Promise<PreparedImage> {
  return kind === "svg" ? prepareSvg(file) : preparePhoto(file);
}
