// MOCK DATA (Phase 2). Sample leads from the design. Replaced in Phase 3 by the sub-account's
// contacts and opportunities (GET leads with source and minutes waiting, plus counts per source).
// Names, addresses and counts are made up. Never treat any value here as real.
import type { Lead, SourceKey } from "./types";

export const MOCK_LEADS: readonly Lead[] = [
  { id: "ld-1", name: "Maria Alvarez", source: "call", need: "Roof leak repair", when: "14 min", mins: 14, address: "142 Weber Rd, Columbus", status: "call" },
  { id: "ld-2", name: "Jordan Reyes", source: "text", need: "Gutter cleaning", when: "1 hr", mins: 60, address: "22 Birch Ln, Dublin", status: "reply" },
  { id: "ld-3", name: "Ellen Novak", source: "form", need: "Skylight leak", when: "2 days", mins: 2880, address: "68 Glen Echo Dr, Columbus", status: "call" },
  { id: "ld-4", name: "Sam Whitaker", source: "form", need: "Roof replacement", when: "2 hrs", mins: 0, address: "530 Riverside Dr, Columbus", status: "booked" },
  { id: "ld-5", name: "Hannah Brooks", source: "ig", need: "Roof inspection", when: "Yesterday", mins: 0, address: "9 Liberty St, Powell", status: "follow" },
  { id: "ld-6", name: "Carlos Mendez", source: "gmb", need: "Roof inspection", when: "Tuesday", mins: 0, address: "1502 Main St, Hilliard", status: "booked" },
  { id: "ld-7", name: "Dana Kim", source: "fb", need: "Gutter guards", when: "Monday", mins: 0, address: "311 Grandview Ave, Columbus", status: "follow" },
  { id: "ld-8", name: "Linda Park", source: "call", need: "Shingle repair", when: "Monday", mins: 0, address: "88 Olentangy St, Columbus", status: "booked" },
];

// How many of this week's leads came from each source (13 in all, more than the 8 rows above).
export const MOCK_WEEK_SOURCES: Readonly<Record<SourceKey, number>> = { call: 4, form: 3, text: 2, gmb: 2, fb: 1, ig: 1 };

// New leads today, before any lead added on screen.
export const MOCK_NEW_TODAY = 4;

// Leads with no contact in the last 3 months.
export const MOCK_OLD_LEADS = 42;
