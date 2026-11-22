// MOCK DATA (Phase 2). The design's sample stops, with fake customers and addresses. Weeks are
// counted from the week that holds "now" (0 = this week), so the sample always sits around today.
// Replaced in Phase 3 by the sub-account's calendar events. Never treat anything here as real.
import type { Stop } from "./types";

// Reminder line for a stop moved to a new time (a line on screen only in Phase 2).
export const REMINDER_DAY_BEFORE = "A reminder goes out the day before";

const NEXT = REMINDER_DAY_BEFORE;

// [week, day, start, len, kind, name, service, address, status]
const ROWS: ReadonlyArray<readonly [number, number, number, number, "E" | "J", string, string, string, string?]> = [
  [-1, 1, 2, 12, "J", "Grace Whitfield", "Gutter replacement", "37 Kenny Rd, Columbus"],
  [-1, 3, 6, 2, "E", "Nina Castillo", "Skylight install", "905 Bryden Rd, Columbus"],
  [-1, 4, 12, 2, "E", "Raj Patel", "Gutter replacement", "18 Tuller Pkwy, Dublin"],
  [-1, 5, 2, 8, "J", "Lena Fox", "Roof repair", "2210 Neil Ave, Columbus"],
  [0, 1, 2, 16, "J", "Paul Ortega", "Roof replacement, day 1 of 2", "88 Linden Ave, Columbus"],
  [0, 2, 2, 12, "J", "Paul Ortega", "Roof replacement, day 2 of 2", "88 Linden Ave, Columbus"],
  [0, 2, 16, 2, "E", "Mark Jensen", "Shingle repair", "310 Park St, Westerville"],
  [0, 3, 2, 4, "J", "Dublin Bakery", "Gutter repair", "63 High St, Dublin"],
  [0, 3, 8, 8, "J", "Hilliard Storage", "Gutter repair", "4000 Cemetery Rd, Hilliard"],
  [0, 3, 18, 2, "E", "Harlan Realty", "Roof replacement", "410 Elm St, Columbus"],
  [0, 4, 2, 12, "J", "Whitmore Dental", "Flat roof patch", "1200 Bethel Rd, Columbus"],
  [0, 4, 16, 2, "E", "Derek Olsen", "Full roof replacement", "76 Oak Hill Dr, Dublin"],
  [0, 5, 3, 2, "E", "Tom Becker", "Roof inspection", "214 Maple Ridge Dr, Dublin"],
  [0, 5, 8, 2, "E", "Linda Park", "Shingle repair", "88 Olentangy St, Columbus", "Confirmed by text"],
  [0, 5, 13, 2, "E", "Carlos Mendez", "Roof inspection", "1502 Main St, Hilliard", "Reminder sent, no answer yet"],
  [0, 5, 16, 4, "J", "Owen Fletcher", "Roof repair", "4100 Sawmill Rd, Columbus", "Confirmed by text"],
  [1, 1, 4, 2, "E", "Sam Whitaker", "Roof replacement", "530 Riverside Dr, Columbus", NEXT],
  [1, 1, 8, 8, "J", "Kate Morgan", "Shingle repair", "19 Sunbury Rd, Westerville", NEXT],
  [1, 2, 2, 16, "J", "Elm Street HOA", "Roof coating", "700 Elm St, Columbus", NEXT],
  [1, 3, 2, 12, "J", "Victor Hale", "Skylight install", "245 Frantz Rd, Dublin", NEXT],
  [1, 4, 2, 10, "J", "Rosa Diaz", "Gutter replacement", "58 Norwich St, Hilliard", NEXT],
];

export const MOCK_STOPS: readonly Stop[] = ROWS.map(([week, day, start, len, kind, name, service, address, status], i) => ({
  id: `stop-${i + 1}`, week, day, start, len, kind, name, service, address, status,
}));
