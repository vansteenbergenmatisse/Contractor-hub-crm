import { safeHttpsUrl } from "@/shared/lib/safe-https-url";

// The logo host rule of `brand/api/logo.ts`, repeated because the brand index also exports server
// code that a client bundle must not pull in. A test pins the two together.
export const DEFAULT_IMAGE_HOSTS: readonly string[] = ["assets.cdn.filesafe.space"];
const IMAGE_FILE = /\.(png|jpe?g|webp|gif|avif)$/i;

export function imageHostsFrom(extra: string | undefined): string[] {
  const more = (extra ?? "").split(",").map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+$/.test(h));
  return [...new Set([...DEFAULT_IMAGE_HOSTS, ...more])];
}

// The clean link to preview, or null. `imageFileOnly`: the path must end in an image extension.
export function previewSrc(raw: string | null | undefined, hosts: readonly string[], imageFileOnly = false): string | null {
  const href = safeHttpsUrl(raw);
  if (!href) return null;
  const url = new URL(href);
  if (url.username !== "" || url.password !== "" || (url.port !== "" && url.port !== "443")) return null;
  if (!hosts.includes(url.hostname.toLowerCase())) return null;
  return imageFileOnly && !IMAGE_FILE.test(url.pathname) ? null : href;
}

// What a native color picker can hold (#rrggbb), for display only. Never written back by itself.
export function pickerHex(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  return /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : null;
}
