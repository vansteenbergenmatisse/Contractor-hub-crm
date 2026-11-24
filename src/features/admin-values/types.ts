// Types shared inside the admin-values feature.

// One custom value on the admin values page. `value` is null when it is too long to send (over 2000
// characters). `secret`: the classifier keeps it from the owner (always hidden, so implicitly locked).
// `editable`: false for a too-long value, a key listed twice, or a key name this page cannot send.
// `ownerReadOnly`: page text the owner sees but can never change here, so a lock means nothing for it.
export type AdminValueRow = { key: string; label: string; value: string | null; secret: boolean; locked: boolean; editable: boolean; ownerReadOnly?: boolean };
export type AdminValueGroup = { id: string; title: string; rows: AdminValueRow[] };
export type AdminValueFolder = { id: string; title: string; groups: AdminValueGroup[] };

// `writable`: the write-back flag is on for this tenant (not off, not EXCLUDED). Without it the page
// is read-only. `loadError`: HighLevel's values could not be read.
export type AdminValuesView = {
  tenantId: string;
  clientName: string;
  writable: boolean;
  loadError?: "permission" | "retry";
  folders: AdminValueFolder[];
};
