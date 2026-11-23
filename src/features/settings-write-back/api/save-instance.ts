import { getBrandService } from "@/features/brand";
import { createTenantCustomValueAdapter } from "@/features/highlevel";
import { beginValueChange, finishValueChange } from "../db/value-changes";
import type { ValueChange } from "@/features/settings";
import { saveCustomValues } from "./write-back";

// The real save. The HighLevel adapter is built per call, so `next build` needs no environment.
export function saveTenantValues(input: { tenantId: string; actorId: string; changes: ValueChange[] }) {
  const adapter = createTenantCustomValueAdapter();
  return saveCustomValues(input, {
    read: adapter.read,
    update: adapter.update,
    begin: beginValueChange,
    finish: finishValueChange,
    invalidate: (tenantId) => getBrandService().invalidate(tenantId),
  });
}
