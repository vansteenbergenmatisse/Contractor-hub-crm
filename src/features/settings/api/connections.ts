import type { Connection, ConnectionStatus } from "../types";
import { CONNECTIONS } from "./fields";

// A row with no status at all: it claims nothing (kept for Phase 3 and for tests).
export const UNKNOWN_CONNECTIONS: readonly ConnectionStatus[] = CONNECTIONS.map(() => ({ state: "unknown" }));

// What each row shows (build prompt section 6, lines 145-146, and section 12):
// - Business phone number: the number is readable (`phonenumbers.read`), so the row can be connected.
//   No API was found for the A2P status: the A2P line says "Not available yet".
// - Calendar: no API was found for the synced calendar, so "Not available yet" (the Calendar page
//   says the same).
// - Facebook page, Instagram, Google My Business: Social Planner accounts give connected or not.
// - Online payments: no API was found for the payment processor, so "Not available yet" (the
//   Payments page says the same).
// MOCK DATA (Phase 2): the connected-or-not values are the design's sample (phone, Facebook and
// Google connected; Instagram not). Phase 3 reads them from HighLevel. Never a real fact.
export const MOCK_CONNECTIONS: readonly ConnectionStatus[] = [
  { state: "connected" },
  { state: "unknown" },
  { state: "connected" },
  { state: "not-connected" },
  { state: "connected" },
  { state: "unknown" },
];

// The app's wording for a status it cannot read (build prompt rule 9).
export const NOT_AVAILABLE = "Not available yet";
// The phone row's A2P line while no API gives the A2P status.
export const A2P_UNKNOWN = "A2P status: Not available yet.";
export const A2P_VERIFIED = "A2P verified. Your texts get delivered.";

// Chip text for a row.
export function connectionChip(st: ConnectionStatus): { text: string; ok: boolean } {
  if (st.state === "connected") return { text: st.note ?? "Connected", ok: true };
  if (st.state === "not-connected") return { text: "Not connected", ok: false };
  return { text: NOT_AVAILABLE, ok: false };
}

export const ASK_LABEL = "Ask Forge Forward to connect";
export const ASKED_NOTE = "Noted on this screen. The request is not sent to Forge Forward yet.";
export const DONE_WHEN = "Done when this row says Connected.";

// The whole text of a connection row, as the design's search reads it (the row's textContent):
// name, phone number, line under the name, chip, the How it works button, the A2P line, what you
// need, the steps, the done-when line and the ask button. Without a status only the fixed text.
export function connectionRowText(
  c: Connection,
  live?: { status: ConnectionStatus; phone?: string; how?: boolean; asked?: boolean; a2p?: boolean },
): string {
  const parts = [c.name];
  if (live?.phone) parts.push(`${live.phone}.`);
  parts.push(c.sub);
  if (live) {
    const on = live.status.state === "connected";
    parts.push(connectionChip(live.status).text, live.how ? "Hide" : "How it works");
    if (on && live.a2p) parts.push(live.status.a2pVerified ? A2P_VERIFIED : A2P_UNKNOWN);
    parts.push("You need:", c.need, ...c.steps, DONE_WHEN);
    if (!on) parts.push(live.asked ? ASKED_NOTE : ASK_LABEL);
  } else {
    parts.push("You need:", c.need, ...c.steps, DONE_WHEN);
  }
  return parts.join(" ");
}
