import type { ImageFormat, ImageKind, PreparedImage } from "../types";

// Runs in the browser, before anything is sent. The server checks everything again.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_SIDE = 2400;
export const MAX_SVG_FILE_BYTES = 512 * 1024;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const QUALITIES = [0.86, 0.76, 0.66, 0.56, 0.46];
const SHRINK_STEPS = [1, 0.8, 0.64, 0.5];

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
// The original's size, for the before and after line.
const sizeOf = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : kb(bytes));

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

type PhotoFormat = Exclude<ImageFormat, "svg">;
const ENCODERS: Record<PhotoFormat, { type: string; label: string; qualities: readonly number[] }> = {
  webp: { type: "image/webp", label: "WebP", qualities: QUALITIES },
  jpeg: { type: "image/jpeg", label: "JPG", qualities: QUALITIES },
  // PNG has no quality setting: only a smaller size makes it smaller.
  png: { type: "image/png", label: "PNG", qualities: [1] },
};

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

// `unsupported`: this browser has no encoder for the format (it quietly returns a PNG instead).
async function encodePhoto(bitmap: ImageBitmap, format: PhotoFormat, originalBytes: number): Promise<PreparedImage | "unsupported"> {
  const encoder = ENCODERS[format];
  const base = fitSize(bitmap.width, bitmap.height);
  for (const step of SHRINK_STEPS) {
    const size = fitSize(base.width * step, base.height * step);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) break;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    for (const quality of encoder.qualities) {
      const blob = await encode(canvas, encoder.type, quality);
      // A browser without this encoder quietly returns a PNG, which would not match the file's name.
      if (!blob || blob.type !== encoder.type) return "unsupported";
      if (blob.size <= MAX_PHOTO_BYTES) {
        const summary = `${encoder.label}, ${size.width} by ${size.height}, ${kb(blob.size)} (was ${sizeOf(originalBytes)})`;
        return { ok: true, blob, previewUrl: URL.createObjectURL(blob), summary };
      }
    }
  }
  return { ok: false, message: "This photo could not be made smaller than 2 MB. Try another one." };
}

// No format asked: WebP, or JPEG where the browser cannot write WebP (older iOS Safari). A format
// asked by the server (the current file's) is the only one tried.
async function preparePhoto(file: File, format: PhotoFormat | undefined): Promise<PreparedImage> {
  if (file.type !== "" && !file.type.startsWith("image/")) return { ok: false, message: "Choose a photo, such as a JPG or PNG." };
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, message: "This photo is over 40 MB. Choose a smaller one." };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: "This file could not be read as a photo. Try a JPG or PNG." };
  }
  try {
    for (const tried of format ? [format] : (["webp", "jpeg"] as const)) {
      const result = await encodePhoto(bitmap, tried, file.size);
      if (result !== "unsupported") return result;
    }
    return { ok: false, message: "This browser cannot prepare the photo. Try Chrome, Edge or Firefox." };
  } finally {
    bitmap.close();
  }
}

// Every photo is compressed: WebP (JPEG fallback), longest side at most 2400, quality lowered until it
// fits. The server names the current file's format when it differs.
export function prepareImageFile(file: File, kind: ImageKind, format?: PhotoFormat): Promise<PreparedImage> {
  return kind === "svg" ? prepareSvg(file) : preparePhoto(file, format);
}
