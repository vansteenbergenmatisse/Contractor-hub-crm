import { settingsValuesFrom } from "./allowlist";

type Row = { key: string; value: string | null | undefined };

// The Settings page's values for one tenant: the tenant's custom values, read by `read` (the server
// passes its reader), filtered by the settings allowlist so secrets stay on the server. When they
// cannot be read, or there is no tenant, the fields stay empty: never the design's sample business.
export async function loadSettingsValues(
  tenantId: string | null | undefined,
  read: (tenantId: string) => Promise<readonly Row[]>,
): Promise<Record<string, string>> {
  if (!tenantId) return {};
  try {
    return settingsValuesFrom(await read(tenantId));
  } catch {
    return {};
  }
}
