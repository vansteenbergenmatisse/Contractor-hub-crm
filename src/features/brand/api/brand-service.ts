import { buildBrand, EMPTY_BRAND } from "./build-brand";
import type { Brand, BrandValue } from "../types";

type Entry = { values: BrandValue[]; brand: Brand };

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

  async function load(tenantId: string): Promise<Entry> {
    const started = generation.get(tenantId) ?? 0;
    const values = await deps.fetchValues(tenantId);
    const entry = { values, brand: buildBrand(values) };
    if ((generation.get(tenantId) ?? 0) === started) {
      cache.set(tenantId, { entry, expiresAt: deps.now() + deps.ttlMs });
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
      return (await getEntry(tenantId)).brand;
    } catch {
      return EMPTY_BRAND;
    }
  }

  // The tenant's raw custom values. Rejects when HighLevel cannot be read.
  async function getValues(tenantId: string): Promise<BrandValue[]> {
    return (await getEntry(tenantId)).values;
  }

  async function loadReadOnly(tenantId: string): Promise<BrandValue[]> {
    const started = generation.get(tenantId) ?? 0;
    const values = await deps.readStoredValues?.(tenantId).catch(() => null);
    if (values) {
      if ((generation.get(tenantId) ?? 0) === started) {
        cache.set(tenantId, { entry: { values, brand: buildBrand(values) }, expiresAt: deps.now() + deps.ttlMs });
      }
      return values;
    }
    const stale = cache.get(tenantId);
    if (stale) return stale.entry.values;
    throw new Error("No readable custom values.");
  }

  // For anonymous pages. A fresh cache entry, else a read with the stored token, else the last
  // cached values. Rejects when there are none. Never reaches the token refresh of `fetchValues`.
  function getValuesReadOnly(tenantId: string): Promise<BrandValue[]> {
    const hit = cache.get(tenantId);
    if (hit && hit.expiresAt > deps.now()) return Promise.resolve(hit.entry.values);
    const pending = readOnlyInflight.get(tenantId);
    if (pending) return pending;
    const request = loadReadOnly(tenantId).finally(() => {
      if (readOnlyInflight.get(tenantId) === request) readOnlyInflight.delete(tenantId);
    });
    readOnlyInflight.set(tenantId, request);
    return request;
  }

  // Called by the onboarding feature's LocationUpdate webhook hook (tenant resolved from the signed
  // event's location). Per server instance only: other instances keep their entry until the TTL.
  function invalidate(tenantId: string) {
    generation.set(tenantId, (generation.get(tenantId) ?? 0) + 1);
    inflight.delete(tenantId);
    readOnlyInflight.delete(tenantId);
    cache.delete(tenantId);
  }

  return { getBrand, getValues, getValuesReadOnly, invalidate };
}
