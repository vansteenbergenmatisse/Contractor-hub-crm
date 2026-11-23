import { getTenantCustomValues, getTenantCustomValuesReadOnly } from "@/features/brand";
import { SettingsPage, loadSettingsValues, sectionFromParam, type AccountLayout } from "@/features/settings";
import { SettingsWriteBackPage, freshValuesReader, isWriteBackEnabled } from "@/features/settings-write-back";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

// Composes the Settings page: the signed-in tenant's custom values (through the brand feature's
// 5-minute cache, filtered by the settings allowlist) and the section named in `?section=`.
export default async function Page({ searchParams }: Props = {}) {
  const user = await getRequestUser();
  const canSave = !user?.viewing && user?.role === "owner" && !!user.tenantId && isWriteBackEnabled(user.tenantId);
  const read = user?.viewing ? getTenantCustomValuesReadOnly : canSave ? freshValuesReader(getTenantCustomValues) : getTenantCustomValues;
  const loaded: { layout?: AccountLayout } = {};
  const values = await loadSettingsValues(user?.tenantId, read, (layout) => {
    loaded.layout = layout;
  });
  const section = sectionFromParam((await searchParams)?.section) ?? undefined;
  return user?.viewing ? (
    <SettingsPage initialValues={values} initialSection={section} account={loaded.layout} readOnly />
  ) : canSave ? (
    <SettingsWriteBackPage initialValues={values} initialSection={section} account={loaded.layout} />
  ) : (
    <SettingsPage initialValues={values} initialSection={section} account={loaded.layout} />
  );
}
