import { headers } from "next/headers";
import { currentUserFromHeaders } from "@/features/auth";
import { listTenantCustomValues } from "@/features/highlevel";
import { SettingsPage } from "@/features/settings";

export const dynamic = "force-dynamic";

// The signed-in sub-account's own custom values fill the fields. When they cannot be read the page
// shows empty fields, never the design's sample business.
export default async function Page() {
  const user = await currentUserFromHeaders(await headers());
  const values: Record<string, string> = {};
  if (user?.tenantId) {
    try {
      for (const { key, value } of await listTenantCustomValues(user.tenantId)) values[key] = value ?? "";
    } catch {
      // Not readable now: empty fields.
    }
  }
  return <SettingsPage initialValues={values} />;
}
