import { hitRateLimit } from "@/features/auth";
import { getTenantCustomValues, getTenantCustomValuesReadOnly } from "@/features/brand";
import { createTenantPhoneNumbersReader } from "@/features/highlevel";
import { SettingsPage, loadSettingsValues, sectionFromParam, type AccountLayout, type LoadStatus, type PhoneNumbersView } from "@/features/settings";
import { SettingsWriteBackPage, freshValuesReader, isMediaReplaceEnabled, isWriteBackEnabled, loadLockedKeys, saveOffReason } from "@/features/settings-write-back";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

async function readPhones(user: Awaited<ReturnType<typeof getRequestUser>>): Promise<PhoneNumbersView | undefined> {
  if (!user?.tenantId) return undefined;
  try {
    const reader = user.viewing ? createTenantPhoneNumbersReader(hitRateLimit, { viewerId: user.id }) : createTenantPhoneNumbersReader(hitRateLimit);
    const read = await reader(user.tenantId);
    return read.ok ? { state: "ok", numbers: read.numbers, complete: read.complete } : { state: read.reason };
  } catch {
    return { state: "unavailable" };
  }
}

// Composes the Settings page: the signed-in tenant's custom values (through the brand feature's
// 5-minute cache, filtered by the settings allowlist) and the section named in `?section=`.
export default async function Page({ searchParams }: Props = {}) {
  const user = await getRequestUser();
  const canSave = !user?.viewing && user?.role === "owner" && !!user.tenantId && isWriteBackEnabled(user.tenantId);
  const read = user?.viewing ? getTenantCustomValuesReadOnly : canSave ? freshValuesReader(getTenantCustomValues) : getTenantCustomValues;
  // Not awaited: the row gets the pending read, so a slow or failed read only changes that row.
  const phoneNumbers = readPhones(user);
  const loaded: { layout?: AccountLayout; status?: LoadStatus } = {};
  // Keys Forge Forward locked: read-only on the page (the save route refuses them as well).
  const locked = loadLockedKeys(user?.tenantId);
  const values = await loadSettingsValues(
    user?.tenantId,
    read,
    (layout) => {
      loaded.layout = layout;
    },
    (status) => {
      loaded.status = status;
    },
  );
  const lockedKeys = await locked;
  if (loaded.layout && lockedKeys.length > 0) loaded.layout = { ...loaded.layout, lockedKeys };
  const section = sectionFromParam((await searchParams)?.section) ?? undefined;
  return user?.viewing ? (
    <SettingsPage initialValues={values} initialSection={section} account={loaded.layout} loadStatus={loaded.status} phoneNumbers={phoneNumbers} readOnly />
  ) : canSave ? (
    <SettingsWriteBackPage initialValues={values} initialSection={section} account={loaded.layout} loadStatus={loaded.status} phoneNumbers={phoneNumbers} mediaReplace={isMediaReplaceEnabled(user?.tenantId ?? "")} />
  ) : (
    <SettingsPage initialValues={values} initialSection={section} account={loaded.layout} loadStatus={loaded.status} phoneNumbers={phoneNumbers} saveDisabledReason={saveOffReason(user?.role, !!user?.tenantId)} />
  );
}
