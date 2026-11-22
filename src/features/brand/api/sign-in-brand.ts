import { safeHttpsUrl } from "@/shared/lib/safe-https-url";
import { isAllowedLogoUrl } from "./logo";
import { brandScopeCss } from "./style";
import { buildBrand } from "./build-brand";
import type { Brand, BrandValue, SignInBrand } from "../types";

// The personal sign-in link (/sign-in?client=<slug>). It is cosmetic: it picks what the signed-out
// page looks like and has no part in authentication. Everything here is public output, so it is
// built field by field from an allowlist and never spreads a Brand or a profile.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 60;
const MAX_BASE = 50;
const MAX_NAME = 80;
const IMAGE_PATH = /\.(png|jpe?g|webp|gif|avif)$/i;

const MINUTE_MS = 60_000;
const LOOKUP_TTL_MS = MINUTE_MS;
const FAILURE_WAIT_MS = MINUTE_MS;
const MAX_CACHED_SLUGS = 1000;
const DEFAULT_LOOKUPS_PER_MINUTE = 300;
const DEFAULT_TIMEOUT_MS = 3000;

// The slug, or null for anything that is not exactly a slug. No lookup happens for a null.
export function parseClientSlug(raw: unknown): string | null {
  return typeof raw === "string" && raw.length <= MAX_SLUG && SLUG.test(raw) ? raw : null;
}

export function slugFromName(name: string | null | undefined): string {
  const slug = (name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_BASE)
    .replace(/^-+|-+$/g, "");
  return slug || "client";
}

export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export const signInPath = (slug: string) => `/sign-in?client=${slug}`;

function publicImage(raw: string | null, hosts: readonly string[]): string | null {
  const url = safeHttpsUrl(raw);
  return url && isAllowedLogoUrl(url, hosts) ? url : null;
}

function publicBackground(raw: string | null, hosts: readonly string[]): string | null {
  const url = publicImage(raw, hosts);
  return url && IMAGE_PATH.test(new URL(url).pathname) ? url : null;
}

function publicName(raw: string | null): string | null {
  const name = (raw ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, MAX_NAME).trim();
  return name || null;
}

// A custom on-main color is only used next to the main color it was checked against. Without one,
// the design's default works out a readable on-main color by itself.
function publicColors(cssVars: Record<string, string>): Record<string, string> {
  const colors = { ...cssVars };
  if (!colors["--main-color"]) delete colors["--text-on-main-color"];
  return colors;
}

export function toPublicSignInBrand(brand: Brand, client: string, hosts: readonly string[]): SignInBrand | null {
  const name = publicName(brand.businessName);
  const logoUrl = publicImage(brand.logoUrl, hosts);
  const backgroundUrl = publicBackground(brand.backgroundImageUrl, hosts);
  const css = brandScopeCss({ cssVars: publicColors(brand.cssVars) });
  if (!name && !logoUrl && !backgroundUrl && !css) return null;
  return { client, name, logoUrl, backgroundUrl, css };
}

type LoaderDeps = {
  // The tenant of a slug when that client is connected, otherwise null.
  findTenantId: (slug: string) => Promise<string | null>;
  // Read-only, through the 5-minute brand cache. Rejects when the values cannot be read.
  readValues: (tenantId: string) => Promise<BrandValue[]>;
  now: () => number;
  hosts: readonly string[];
  timeoutMs?: number;
  maxLookupsPerMinute?: number;
};

// Anonymous traffic reaches this, so its cost is bounded: a malformed value stops before any lookup,
// a slug is looked up at most once a minute, new lookups have a per-instance budget per minute, and
// a failed HighLevel read waits a minute. Every failure gives null, which is the neutral page.
export function createSignInBrandLoader(deps: LoaderDeps) {
  const budget = deps.maxLookupsPerMinute ?? DEFAULT_LOOKUPS_PER_MINUTE;
  const slugs = new Map<string, { tenantId: string | null; expiresAt: number }>();
  const failedUntil = new Map<string, number>();
  let windowStart = deps.now();
  let used = 0;

  function spendLookup(): boolean {
    const now = deps.now();
    if (now - windowStart >= MINUTE_MS) {
      windowStart = now;
      used = 0;
    }
    if (used >= budget) return false;
    used += 1;
    return true;
  }

  async function tenantOf(slug: string): Promise<string | null> {
    const hit = slugs.get(slug);
    if (hit && hit.expiresAt > deps.now()) return hit.tenantId;
    if (!spendLookup()) return null;
    const tenantId = await deps.findTenantId(slug);
    slugs.delete(slug);
    if (slugs.size >= MAX_CACHED_SLUGS) slugs.delete(slugs.keys().next().value as string);
    slugs.set(slug, { tenantId, expiresAt: deps.now() + LOOKUP_TTL_MS });
    return tenantId;
  }

  async function resolve(slug: string): Promise<SignInBrand | null> {
    const tenantId = await tenantOf(slug);
    if (!tenantId) return null;
    if ((failedUntil.get(tenantId) ?? 0) > deps.now()) return null;
    try {
      const values = await deps.readValues(tenantId);
      failedUntil.delete(tenantId);
      return toPublicSignInBrand(buildBrand(values), slug, deps.hosts);
    } catch {
      failedUntil.set(tenantId, deps.now() + FAILURE_WAIT_MS);
      return null;
    }
  }

  return async function load(raw: unknown): Promise<SignInBrand | null> {
    const slug = parseClientSlug(raw);
    if (!slug) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((done) => {
      timer = setTimeout(() => done(null), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    });
    try {
      return await Promise.race([resolve(slug), timeout]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
