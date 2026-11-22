import { listTenantCustomValues } from "@/features/highlevel";
import { createBrandService } from "./brand-service";
import type { BrandValue } from "../types";

const TTL_MS = 5 * 60 * 1000;

let service: ReturnType<typeof createBrandService> | undefined;

// One brand service per server instance. Reads the tenant's HighLevel custom values.
export function getBrandService() {
  service ??= createBrandService({ fetchValues: listTenantCustomValues, now: () => Date.now(), ttlMs: TTL_MS });
  return service;
}

// Server only. A tenant's raw custom values (every key, secrets included) through the same 5-minute
// cache as the brand. Rejects when HighLevel cannot be read. Filter before anything reaches a browser.
// After a save, call `getBrandService().invalidate(tenantId)` so the next read is fresh.
export function getTenantCustomValues(tenantId: string): Promise<BrandValue[]> {
  return getBrandService().getValues(tenantId);
}
