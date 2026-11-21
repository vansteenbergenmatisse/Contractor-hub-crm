import { buildBrand, EMPTY_BRAND } from "./build-brand";
import type { Brand, BrandValue } from "../types";

// Per-tenant brand cache (build prompt section 5: cache per tenant, revalidate on save or on a
// LocationUpdate webhook through `invalidate`). A HighLevel failure never breaks a page: the default
// brand is returned and the failure is not cached. The cache lives in one server instance's memory.
export function createBrandService(deps: {
  fetchValues: (tenantId: string) => Promise<BrandValue[]>;
  now: () => number;
  ttlMs: number;
}) {
  const cache = new Map<string, { brand: Brand; expiresAt: number }>();
  const inflight = new Map<string, Promise<Brand>>();

  async function load(tenantId: string): Promise<Brand> {
    try {
      const brand = buildBrand(await deps.fetchValues(tenantId));
      cache.set(tenantId, { brand, expiresAt: deps.now() + deps.ttlMs });
      return brand;
    } catch {
      return EMPTY_BRAND;
    }
  }

  async function getBrand(tenantId: string): Promise<Brand> {
    const hit = cache.get(tenantId);
    if (hit && hit.expiresAt > deps.now()) return hit.brand;
    const pending = inflight.get(tenantId);
    if (pending) return pending;
    const request = load(tenantId).finally(() => inflight.delete(tenantId));
    inflight.set(tenantId, request);
    return request;
  }

  function invalidate(tenantId: string) {
    cache.delete(tenantId);
  }

  return { getBrand, invalidate };
}
