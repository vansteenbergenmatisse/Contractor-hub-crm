import { listTenantCustomValues } from "@/features/highlevel";
import { createBrandService } from "./brand-service";

const TTL_MS = 5 * 60 * 1000;

let service: ReturnType<typeof createBrandService> | undefined;

// One brand service per server instance. Reads the tenant's HighLevel custom values.
export function getBrandService() {
  service ??= createBrandService({ fetchValues: listTenantCustomValues, now: () => Date.now(), ttlMs: TTL_MS });
  return service;
}
