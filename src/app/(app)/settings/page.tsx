import { getTenantCustomValues, getTenantCustomValuesReadOnly } from "@/features/brand";
import { SettingsPage, loadSettingsValues, sectionFromParam } from "@/features/settings";
import { SettingsWriteBackPage, isWriteBackEnabled } from "@/features/settings-write-back";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

// Composes the Settings page: the signed-in tenant's custom values (through the brand feature's
// 5-minute cache, filtered by the settings allowlist) and the section named in `?section=`.
export default async function Page({ searchParams }: Props = {}) {
  const user = await getRequestUser();
  const values = await loadSettingsValues(user?.tenantId, user?.viewing ? getTenantCustomValuesReadOnly : getTenantCustomValues);
  const section = sectionFromParam((await searchParams)?.section) ?? undefined;
  return user?.viewing ? (
    <SettingsPage initialValues={values} initialSection={section} readOnly />
  ) : user?.role === "owner" && user.tenantId && isWriteBackEnabled(user.tenantId) ? (
    <SettingsWriteBackPage initialValues={values} initialSection={section} />
  ) : (
    <SettingsPage initialValues={values} initialSection={section} />
  );
}
