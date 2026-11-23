import { settingsValuesFrom } from "./allowlist";
import { imageHostsFrom } from "./image-preview";

type Row = { key: string; value: string | null | undefined };

// What the page needs to arrange a loaded account: the hosts an image preview may load from.
export type AccountLayout = { imageHosts: string[] };

// The Settings page's values for one tenant: the tenant's custom values, read by `read` (the server
// passes its reader), filtered by the settings allowlist so secrets stay on the server. When they
// cannot be read, or there is no tenant, the fields stay empty: never the design's sample business.
// `onLayout` is called only after a good read, so a failed read never looks like removed keys.
export async function loadSettingsValues(
  tenantId: string | null | undefined,
  read: (tenantId: string) => Promise<readonly Row[]>,
  onLayout?: (layout: AccountLayout) => void,
): Promise<Record<string, string>> {
  if (!tenantId) return {};
  try {
    const rows = await read(tenantId);
    const values = settingsValuesFrom(rows);
    onLayout?.({ imageHosts: imageHostsFrom(process.env.LOGO_HOST_ALLOWLIST) });
    return values;
  } catch {
    return {};
  }
}
