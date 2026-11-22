import { headers } from "next/headers";
import { currentUserFromHeaders } from "@/features/auth";
import { listTenantCustomValues } from "@/features/highlevel";
import { SettingsPage, sectionFromParam, settingsValuesFrom } from "@/features/settings";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

// The signed-in sub-account's own custom values fill the fields, filtered by the settings allowlist so
// the form webhook and other secrets stay on the server. When they cannot be read the page shows empty
// fields, never the design's sample business. `?section=connections` opens that section.
export default async function Page({ searchParams }: Props = {}) {
  const user = await currentUserFromHeaders(await headers());
  let values: Record<string, string> = {};
  if (user?.tenantId) {
    try {
      values = settingsValuesFrom(await listTenantCustomValues(user.tenantId));
    } catch {
      // Not readable now: empty fields.
    }
  }
  const section = sectionFromParam((await searchParams)?.section) ?? undefined;
  return <SettingsPage initialValues={values} initialSection={section} />;
}
