import type { Connection, ConnectionStatus } from "../types";
import { CONNECTIONS } from "./fields";

// The default for every row: no real status source exists yet, so the page claims nothing and each
// row says "Not available yet". Phase 3 passes real statuses through SettingsPage's `connections`.
export const UNKNOWN_CONNECTIONS: readonly ConnectionStatus[] = CONNECTIONS.map(() => ({ state: "unknown" }));

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
const INTRO = "What is linked to your dashboard. A row that is not connected shows its steps.";
const INTRO_NO_STATUS = "Your dashboard's connections. The status of each connection cannot be shown yet.";

// The Connections intro: the plain wording until at least one row has a real status.
export function connectionsIntro(statuses: readonly ConnectionStatus[]): string {
  return statuses.some((s) => s.state !== "unknown") ? INTRO : INTRO_NO_STATUS;
}

// The whole text of a connection row, as the design's search reads it (the row's textContent):
// name, phone number, line under the name, chip, the How it works button, the A2P line, what you
// need, the steps, the done-when line and the ask button. A row whose status is unknown reads only
// its name, line under the name and chip. Without `live` only the fixed text.
export function connectionRowText(
  c: Connection,
  live?: { status: ConnectionStatus; phone?: string; how?: boolean; asked?: boolean; a2p?: boolean },
): string {
  const parts = [c.name];
  if (live?.phone) parts.push(`${live.phone}.`);
  parts.push(c.sub);
  if (live) {
    if (live.status.state === "unknown") {
      parts.push(connectionChip(live.status).text);
      return parts.join(" ");
    }
    const on = live.status.state === "connected";
    parts.push(connectionChip(live.status).text, live.how ? "Hide" : "How it works");
    if (on && live.a2p) parts.push(live.status.a2pVerified ? A2P_VERIFIED : A2P_UNKNOWN);
    parts.push("You need:", c.need, ...c.steps, DONE_WHEN);
    if (live.status.state === "not-connected") parts.push(live.asked ? ASKED_NOTE : ASK_LABEL);
  } else {
    parts.push("You need:", c.need, ...c.steps, DONE_WHEN);
  }
  return parts.join(" ");
}
