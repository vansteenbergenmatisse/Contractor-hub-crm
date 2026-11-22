import type { Brand } from "../types";

// The web app manifest of one sub-account, so "Add to Home Screen" on Android and iPhone installs the
// client's own app: its name, its colors and its logo as the icon. All values come from the custom
// values (already validated: colors are plain hex, links are https). Without them, neutral defaults.
export const ICON_SIZES = [180, 192, 512] as const;

const DEFAULT_NAME = "Contractor Hub CRM";

export type WebManifest = {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  orientation: "portrait";
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: "image/png"; purpose: "any" | "maskable" }>;
};

export function buildManifest(brand: Brand): WebManifest {
  const name = brand.businessName ?? DEFAULT_NAME;
  const shortName = name.length > 12 ? name.split(/\s+/)[0].slice(0, 12) : name;
  return {
    name,
    short_name: shortName,
    description: `${name}: leads, quotes and invoices.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: brand.cssVars["--background-color"] ?? "#ffffff",
    theme_color: brand.cssVars["--main-color"] ?? "#2e7d32",
    icons: [
      { src: "/api/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/pwa-icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

// Which icon the request asks for: only the listed sizes, and a maskable flag. Anything else is the
// default 192 (the route never trusts the query string).
export function parseIconRequest(search: URLSearchParams): { size: (typeof ICON_SIZES)[number]; maskable: boolean } {
  const wanted = Number(search.get("size"));
  const size = (ICON_SIZES as readonly number[]).includes(wanted) ? (wanted as (typeof ICON_SIZES)[number]) : 192;
  return { size, maskable: search.get("maskable") === "1" };
}

export const MANIFEST_DEFAULT_NAME = DEFAULT_NAME;
