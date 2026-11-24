import { settingsValuesFrom } from "./allowlist";
import { imageHostsFrom } from "./image-preview";

type Row = { key: string; value: string | null | undefined };

// What the page needs to arrange a loaded account: the hosts an image preview may load from.
export type AccountLayout = { imageHosts: string[] };

// How the read went. `ok`: values arrived (blank ones count). `empty`: HighLevel answered, but with no
// key Settings shows. `failed`: the read or the filter failed. `not-connected`: no tenant, or the
// tenant has no connected sub-account (the reader rejects with `code: "not-connected"`).
export type LoadStatus = "ok" | "empty" | "failed" | "not-connected";

const isNotConnected = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "not-connected";

// The Settings page's values for one tenant: the tenant's custom values, read by `read` (the server
// passes its reader), filtered by the settings allowlist so secrets stay on the server. When they
// cannot be read, or there is no tenant, the fields stay empty: never the design's sample business.
// `onLayout` is called only after a good read, so a failed read never looks like removed keys.
// `onStatus` gets how the read went, so the page says "did not load" only on a real failure.
export async function loadSettingsValues(
  tenantId: string | null | undefined,
  read: (tenantId: string) => Promise<readonly Row[]>,
  onLayout?: (layout: AccountLayout) => void,
  onStatus?: (status: LoadStatus) => void,
): Promise<Record<string, string>> {
  if (!tenantId) {
    onStatus?.("not-connected");
    return {};
  }
  // Log lines carry a step and a row count only, never a key's value.
  let rows: readonly Row[];
  try {
    rows = await read(tenantId);
  } catch (error) {
    const notConnected = isNotConnected(error);
    console.error(`Settings values did not load: step=${notConnected ? "not-connected" : "read"}`);
    onStatus?.(notConnected ? "not-connected" : "failed");
    return {};
  }
  try {
    const values = settingsValuesFrom(rows);
    const empty = Object.keys(values).length === 0;
    if (empty) {
      console.error(`Settings values did not load: step=${rows.length === 0 ? "empty" : "none-allowed"} rows=${rows.length}`);
    }
    onLayout?.({ imageHosts: imageHostsFrom(process.env.LOGO_HOST_ALLOWLIST) });
    onStatus?.(empty ? "empty" : "ok");
    return values;
  } catch {
    console.error("Settings values did not load: step=filter");
    onStatus?.("failed");
    return {};
  }
}
