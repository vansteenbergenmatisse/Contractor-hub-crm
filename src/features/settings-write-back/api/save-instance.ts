import { getBrandService } from "@/features/brand";
import { createTenantCustomValueAdapter } from "@/features/highlevel";
import { isSettingsKeyAllowed, type ValueChange } from "@/features/settings";
import { beginValueChange, finishValueChange } from "../db/value-changes";
import { claimSaveLock, releaseSaveLock } from "../db/save-lock";
import { lockedKeysOf } from "../db/value-locks";
import { saveCustomValues } from "./write-back";

// The real save. The HighLevel adapter is built per call, so `next build` needs no environment.
// `scope: "admin"`: the admin values page (every key, locks ignored); otherwise the owner's save,
// which reads the tenant's locks and refuses a locked key.
export function saveTenantValues(input: { tenantId: string; actorId: string; changes: ValueChange[]; unlocked?: string; scope?: "owner" | "admin" }) {
  const adapter = createTenantCustomValueAdapter();
  return saveCustomValues(input, {
    locks: lockedKeysOf,
    read: adapter.read,
    update: adapter.update,
    begin: beginValueChange,
    finish: finishValueChange,
    invalidate: (tenantId) => getBrandService().expire(tenantId),
    claim: claimSaveLock,
    release: releaseSaveLock,
    now: () => Date.now(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}

type Row = { key: string; value: string };

// What the owner edits must be what the account holds now: the brand cache can be up to five minutes
// old on another server instance. If the fresh read fails it falls back, and the save's own check
// still refuses to overwrite a value that differs.
export function freshValuesReader(fallback: (tenantId: string) => Promise<readonly Row[]>) {
  return async (tenantId: string): Promise<readonly Row[]> => {
    try {
      const answer = await createTenantCustomValueAdapter().read(tenantId);
      // A key listed twice shows its first value, as the brand reader does. The save never writes it.
      if (answer.ok) return [...answer.values, ...(answer.duplicates ?? [])].map(({ key, value }) => ({ key, value }));
    } catch {
      console.error("Settings fresh read failed");
    }
    return fallback(tenantId);
  };
}

// The keys the Settings page shows read-only as "Locked by Forge Forward". A failed read marks none:
// the owner's save reads the locks again and writes nothing when it cannot (fails closed).
export async function loadLockedKeys(tenantId: string | null | undefined): Promise<string[]> {
  if (!tenantId) return [];
  try {
    // Only names of keys the owner is shown: a hidden key's name never reaches the browser.
    return [...(await lockedKeysOf(tenantId))].filter(isSettingsKeyAllowed).sort();
  } catch {
    console.error("Settings locks did not load: step=read");
    return [];
  }
}
