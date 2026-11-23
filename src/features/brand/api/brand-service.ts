import { buildBrand, EMPTY_BRAND } from "./build-brand";
import type { Brand, BrandValue } from "../types";

type Entry = { values: BrandValue[]; brand: Brand };

// Just after a save HighLevel may still answer with the old value, and no later version arrives when
// the write lands. So for this long after a version change, a read is kept only briefly. Proposals,
// not measured numbers.
const VERSION_SETTLING_MS = 60_000;
const SETTLING_TTL_MS = 5_000;

// Per-tenant brand cache (build prompt section 5: cache per tenant, revalidate on save or on a
// LocationUpdate webhook through `invalidate`). It keeps the raw custom values next to the brand built
// from them, so other server code can read the values without a second HighLevel call. A HighLevel
// failure never breaks a page: `getBrand` returns the default brand, `getValues` rejects (the caller
// decides), and the failure is not cached. The cache lives in one server instance's memory.
export function createBrandService(deps: {
  fetchValues: (tenantId: string) => Promise<BrandValue[]>;
  // For anonymous pages: reads without refreshing a token or changing connection state. Null when
  // the stored token cannot be used.
  readStoredValues?: (tenantId: string) => Promise<BrandValue[] | null>;
  // Shared by all server instances; a new answer means a save finished somewhere, so the copy here is
  // dropped. When it cannot be read the cache is used as is, until the TTL.
  readVersion?: (tenantId: string) => Promise<string | null>;
  now: () => number;
  ttlMs: number;
}) {
  const cache = new Map<string, { entry: Entry; expiresAt: number }>();
  const inflight = new Map<string, Promise<Entry>>();
  // Separate from `inflight`: a signed-in read must never wait on, or fail with, an anonymous one.
  const readOnlyInflight = new Map<string, Promise<BrandValue[]>>();
  // Bumped by invalidate: a fetch that started before an invalidate must not put its (older) result
  // back into the cache.
  const generation = new Map<string, number>();
  const seenVersion = new Map<string, string | null>();
  // The values of an entry dropped by a version change, for read-only paths that cannot read HighLevel.
  const lastGood = new Map<string, BrandValue[]>();

  function expiry(tenantId: string): number {
    const now = deps.now();
    const settling = now - Date.parse(seenVersion.get(tenantId) ?? "") < VERSION_SETTLING_MS;
    return now + (settling ? Math.min(SETTLING_TTL_MS, deps.ttlMs) : deps.ttlMs);
  }

  async function syncVersion(tenantId: string): Promise<void> {
    let version: string | null;
    try {
      version = (await deps.readVersion?.(tenantId)) ?? null;
    } catch {
      return;
    }
    if (seenVersion.has(tenantId) && seenVersion.get(tenantId) === version) return;
    seenVersion.set(tenantId, version);
    expire(tenantId);
  }

  // Without `readVersion` the read starts at once, in the same tick.
  const current = <T>(tenantId: string, read: () => Promise<T>): Promise<T> =>
    deps.readVersion ? syncVersion(tenantId).then(read) : read();

  async function load(tenantId: string): Promise<Entry> {
    const started = generation.get(tenantId) ?? 0;
    const values = await deps.fetchValues(tenantId);
    const entry = { values, brand: buildBrand(values) };
    if ((generation.get(tenantId) ?? 0) === started) {
      cache.set(tenantId, { entry, expiresAt: expiry(tenantId) });
    }
    return entry;
  }

  function getEntry(tenantId: string): Promise<Entry> {
    const hit = cache.get(tenantId);
    if (hit && hit.expiresAt > deps.now()) return Promise.resolve(hit.entry);
    const pending = inflight.get(tenantId);
    if (pending) return pending;
    const request = load(tenantId).finally(() => {
      if (inflight.get(tenantId) === request) inflight.delete(tenantId);
    });
    inflight.set(tenantId, request);
    return request;
  }

  async function getBrand(tenantId: string): Promise<Brand> {
    try {
      return (await current(tenantId, () => getEntry(tenantId))).brand;
    } catch {
      return EMPTY_BRAND;
    }
  }

  // The tenant's raw custom values. Rejects when HighLevel cannot be read.
  async function getValues(tenantId: string): Promise<BrandValue[]> {
    return (await current(tenantId, () => getEntry(tenantId))).values;
  }

  async function loadReadOnly(tenantId: string): Promise<BrandValue[]> {
    const started = generation.get(tenantId) ?? 0;
    const values = await deps.readStoredValues?.(tenantId).catch(() => null);
    if (values) {
      if ((generation.get(tenantId) ?? 0) === started) {
        cache.set(tenantId, { entry: { values, brand: buildBrand(values) }, expiresAt: expiry(tenantId) });
      }
      return values;
    }
    const stale = cache.get(tenantId)?.entry.values ?? lastGood.get(tenantId);
    if (stale) return stale;
    throw new Error("No readable custom values.");
  }

  // For anonymous pages. A fresh cache entry, else a read with the stored token, else the last
  // cached values. Rejects when there are none. Never reaches the token refresh of `fetchValues`.
  function getValuesReadOnly(tenantId: string): Promise<BrandValue[]> {
    return current(tenantId, () => {
      const hit = cache.get(tenantId);
      if (hit && hit.expiresAt > deps.now()) return Promise.resolve(hit.entry.values);
      const pending = readOnlyInflight.get(tenantId);
      if (pending) return pending;
      const request = loadReadOnly(tenantId).finally(() => {
        if (readOnlyInflight.get(tenantId) === request) readOnlyInflight.delete(tenantId);
      });
      readOnlyInflight.set(tenantId, request);
      return request;
    });
  }

  // The brand for an admin's read-only client view: never reaches a token refresh.
  async function getBrandReadOnly(tenantId: string): Promise<Brand> {
    try {
      return buildBrand(await getValuesReadOnly(tenantId));
    } catch {
      return EMPTY_BRAND;
    }
  }

  // Called by the onboarding feature's LocationUpdate webhook hook (tenant resolved from the signed
  // event's location). Per server instance only: other instances keep their entry until the TTL.
  function invalidate(tenantId: string) {
    generation.set(tenantId, (generation.get(tenantId) ?? 0) + 1);
    inflight.delete(tenantId);
    readOnlyInflight.delete(tenantId);
    cache.delete(tenantId);
    lastGood.delete(tenantId);
  }

  // After a save: the next read goes to HighLevel, but a read-only path that cannot reach it still
  // has the last good values instead of falling back to the default brand.
  function expire(tenantId: string) {
    const keep = cache.get(tenantId)?.entry.values ?? lastGood.get(tenantId);
    invalidate(tenantId);
    if (keep) lastGood.set(tenantId, keep);
  }

  return { getBrand, getBrandReadOnly, getValues, getValuesReadOnly, invalidate, expire };
}
