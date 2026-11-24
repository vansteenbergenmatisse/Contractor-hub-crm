import type { CustomValueRead } from "@/features/highlevel";
import { MAX_VALUE_LENGTH, arrangeKeys, classifyKey, isSecretValue, labelOfKey } from "@/features/settings";
import type { AdminValueRow, AdminValuesView } from "../types";

// A key this page can send back to the route (same rule as the route's parser).
export const ADMIN_KEY = /^[A-Za-z0-9_]{1,100}$/;

type Input = { tenantId: string; clientName: string; read: CustomValueRead; locked: ReadonlySet<string>; writable: boolean };

// Every custom value of the client, grouped like the owner's Settings page. Admin only: secret-looking
// values are included here and nowhere else.
export function buildAdminValuesView({ tenantId, clientName, read, locked, writable }: Input): AdminValuesView {
  if (!read.ok) return { tenantId, clientName, writable, loadError: read.reason, folders: [] };
  const rows = new Map<string, AdminValueRow>();
  for (const { key, value } of read.values) {
    if (rows.has(key)) continue;
    const long = value.length > MAX_VALUE_LENGTH;
    rows.set(key, {
      key,
      label: labelOfKey(key),
      value: long ? null : value,
      secret: classifyKey(key) === "secret" || isSecretValue(value),
      locked: locked.has(key),
      editable: !long && ADMIN_KEY.test(key),
    });
  }
  // A key listed twice is never written (the save refuses it), so it shows read-only.
  for (const { key, value } of read.duplicates ?? []) {
    const long = value.length > MAX_VALUE_LENGTH;
    rows.set(key, { key, label: labelOfKey(key), value: long ? null : value, secret: classifyKey(key) === "secret" || isSecretValue(value), locked: locked.has(key), editable: false });
  }
  const folders = arrangeKeys([...rows.keys()]).map(({ folder, groups }) => ({
    id: folder.id,
    title: folder.title,
    groups: groups.map((group) => ({ id: group.id, title: group.title, rows: group.keys.map((key) => rows.get(key) as AdminValueRow) })),
  }));
  return { tenantId, clientName, writable, folders };
}
