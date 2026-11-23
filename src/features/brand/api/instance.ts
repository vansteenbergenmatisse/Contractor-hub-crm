import { listTenantCustomValues, readTenantCustomValuesStored } from "@/features/highlevel";
import { createBrandService } from "./brand-service";
import { allowedLogoHosts } from "./logo";
import { createSignInBrandLoader } from "./sign-in-brand";
import { findConnectedTenantBySlug } from "../db/sign-in-link";
import type { BrandValue } from "../types";

const TTL_MS = 5 * 60 * 1000;

let service: ReturnType<typeof createBrandService> | undefined;

// One brand service per server instance. Reads the tenant's HighLevel custom values.
export function getBrandService() {
  service ??= createBrandService({
    fetchValues: listTenantCustomValues,
    readStoredValues: (tenantId) => readTenantCustomValuesStored(tenantId),
    now: () => Date.now(),
    ttlMs: TTL_MS,
  });
  return service;
}

// Server only. A tenant's raw custom values (every key, secrets included) through the same 5-minute
// cache as the brand. Rejects when HighLevel cannot be read. Filter before anything reaches a browser.
// After a save, call `getBrandService().invalidate(tenantId)` so the next read is fresh.
export function getTenantCustomValues(tenantId: string): Promise<BrandValue[]> {
  return getBrandService().getValues(tenantId);
}

// The same values for an admin's read-only client view: never refreshes a token.
export function getTenantCustomValuesReadOnly(tenantId: string): Promise<BrandValue[]> {
  return getBrandService().getValuesReadOnly(tenantId);
}

let signInLoader: ReturnType<typeof createSignInBrandLoader> | undefined;

// The public branding of a personal sign-in link, or null for the neutral page. Takes the raw query
// value; it is validated before anything is looked up.
export function loadSignInBrand(raw: unknown) {
  signInLoader ??= createSignInBrandLoader({
    findTenantId: findConnectedTenantBySlug,
    // Read-only on purpose: an anonymous visit must never refresh a token or change a connection.
    readValues: (tenantId) => getBrandService().getValuesReadOnly(tenantId),
    now: () => Date.now(),
    hosts: allowedLogoHosts(),
  });
  return signInLoader(raw);
}
