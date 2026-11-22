import type { ConnectionStatus } from "../types";
import { CONNECTIONS } from "./fields";

// What the app knows about each connection today: nothing. No API reads the phone number's A2P
// status, the synced calendar, the social accounts or the payment processor yet (build prompt
// section 6; the Calendar and Payments pages say "Not available yet" for the same reason). So every
// row shows "Not available yet" with its steps, and never "Connected". Phase 3 passes real statuses.
export const UNKNOWN_CONNECTIONS: readonly ConnectionStatus[] = CONNECTIONS.map(() => ({ state: "unknown" }));

// Chip text for a row. "Not available yet" is the app's wording for a status it cannot read.
export function connectionChip(st: ConnectionStatus): { text: string; ok: boolean } {
  if (st.state === "connected") return { text: st.note ?? "Connected", ok: true };
  if (st.state === "not-connected") return { text: "Not connected", ok: false };
  return { text: "Not available yet", ok: false };
}
