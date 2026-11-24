import { settingsReadFrom } from "./allowlist";
import { imageHostsFrom } from "./image-preview";
import { unplacedKeys } from "./layout";

type Row = { key: string; value: string | null | undefined };

// What the page needs to arrange a loaded account: the hosts an image preview may load from, and
// the shown keys whose value is too long to edit here (names only, never their values).
export type AccountLayout = { imageHosts: string[]; longKeys?: string[] };

// How the read went. `ok`: values arrived (blank ones count). `empty`: HighLevel answered, but with no
// key Settings shows. `failed`: the read or the filter failed. `not-connected`: no tenant, or the
// tenant has no connected sub-account (the reader rejects with `code: "not-connected"`).
export type LoadStatus = "ok" | "empty" | "failed" | "not-connected";

const isNotConnected = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "not-connected";

// The Settings page's values for one tenant: the tenant's custom values, read by `read` (the server
// passes its reader), classified on the server so secrets (name and value) stay there. When they
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
    const { values, longKeys } = settingsReadFrom(rows);
    const empty = Object.keys(values).length === 0 && longKeys.length === 0;
    if (empty) {
      console.error(`Settings values did not load: step=${rows.length === 0 ? "empty" : "none-allowed"} rows=${rows.length}`);
    }
    // Key names only (never values), so the next layout re-run knows what to place.
    const unplaced = unplacedKeys([...Object.keys(values), ...longKeys]);
    if (unplaced.length > 0) console.warn(`Settings layout: unplaced keys=${unplaced.join(",")}`);
    onLayout?.({ imageHosts: imageHostsFrom(process.env.LOGO_HOST_ALLOWLIST), longKeys });
    onStatus?.(empty ? "empty" : "ok");
    return values;
  } catch {
    console.error("Settings values did not load: step=filter");
    onStatus?.("failed");
    return {};
  }
}
