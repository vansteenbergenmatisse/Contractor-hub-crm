// MOCK DATA (Phase 2). Sample customers, services, addresses, amounts and times copied from the design.
// Nothing here is real. Replaced in Phase 3 by the opportunities of the sub-account's pipeline in HighLevel.
// Flags `opened`, `returning` and `review` are made-up values that stand in for what HighLevel will tell us.
import type { MockCard } from "./types";

export const MOCK_CARDS: readonly MockCard[] = [
  { name: "Maria Alvarez", init: "MA", service: "Roof leak repair", address: "142 Weber Rd, Columbus", stage: 0, since: "14 min", amount: "", opened: false, returning: false, review: true },
  { name: "Jordan Reyes", init: "JR", service: "Gutter cleaning", address: "22 Birch Ln, Dublin", stage: 0, since: "1 hr", amount: "", opened: true, returning: true, review: false },
  { name: "Ellen Novak", init: "EN", service: "Skylight leak", address: "68 Glen Echo Dr, Columbus", stage: 0, since: "3 hrs", amount: "", opened: false, returning: false, review: false },
  { name: "Hannah Brooks", init: "HB", service: "Roof inspection", address: "9 Liberty St, Powell", stage: 1, since: "Day 2", amount: "", opened: true, returning: true, review: true },
  { name: "Luis Ortega", init: "LO", service: "Shingle repair", address: "77 Avery Rd, Dublin", stage: 1, since: "Day 4", amount: "", opened: false, returning: false, review: false },
  { name: "Dana Kim", init: "DK", service: "Gutter guards", address: "311 Grandview Ave, Columbus", stage: 1, since: "Day 4", amount: "", opened: true, returning: true, review: false },
  { name: "Peter Walsh", init: "PW", service: "Roof replacement", address: "1840 Northwest Blvd, Columbus", stage: 1, since: "Day 7", amount: "", opened: false, returning: false, review: true },
  { name: "Aisha Rahman", init: "AR", service: "Chimney flashing", address: "26 Cooper Rd, Westerville", stage: 1, since: "Day 7", amount: "", opened: true, returning: true, review: false },
  { name: "Greg Tanner", init: "GT", service: "Storm damage check", address: "503 Scioto St, Hilliard", stage: 1, since: "Day 14", amount: "", opened: false, returning: false, review: false },
  { name: "Tom Becker", init: "TB", service: "Roof inspection", address: "214 Maple Ridge Dr, Dublin", stage: 2, since: "Today 8:30 AM", amount: "", opened: true, returning: true, review: true },
  { name: "Linda Park", init: "LP", service: "Shingle repair", address: "88 Olentangy St, Columbus", stage: 2, since: "Today 11:00 AM", amount: "", opened: false, returning: false, review: false },
  { name: "Carlos Mendez", init: "CM", service: "Roof inspection", address: "1502 Main St, Hilliard", stage: 2, since: "Today 1:30 PM", amount: "", opened: true, returning: true, review: false },
  { name: "Sam Whitaker", init: "SW", service: "Roof replacement", address: "530 Riverside Dr, Columbus", stage: 2, since: "Mon 9:00 AM", amount: "", opened: false, returning: false, review: true },
  { name: "Derek Olsen", init: "DO", service: "Full roof replacement", address: "76 Oak Hill Dr, Dublin", stage: 3, since: "Quote ready", amount: "$18,400", opened: true, returning: true, review: false, quote: "ready" },
  { name: "Harlan Realty", init: "HR", service: "Roof replacement", address: "410 Elm St, Columbus", stage: 4, since: "Sent yesterday", amount: "$31,400", opened: false, returning: false, review: false },
  { name: "Raj Patel", init: "RP", service: "Gutter replacement", address: "18 Tuller Pkwy, Dublin", stage: 4, since: "Opened 3 times", amount: "$12,900", opened: true, returning: true, review: true },
  { name: "Nina Castillo", init: "NC", service: "Skylight install", address: "905 Bryden Rd, Columbus", stage: 4, since: "Day 6", amount: "$8,200", opened: false, returning: false, review: false },
  { name: "Mark Jensen", init: "MJ", service: "Shingle repair", address: "310 Park St, Westerville", stage: 4, since: "Day 2", amount: "$6,150", opened: true, returning: true, review: false },
  { name: "Tina Wu", init: "TW", service: "Roof coating", address: "15 Indianola Ave, Columbus", stage: 4, since: "Day 12", amount: "$3,600", opened: false, returning: false, review: true },
  { name: "Brian Cole", init: "BC", service: "Roof replacement", address: "94 Karl Rd, Columbus", stage: 5, since: "Link sent 2 hrs ago", amount: "$7,800", opened: true, returning: true, review: false },
  { name: "Sofia Marin", init: "SM", service: "Gutter guards", address: "230 Brand Rd, Dublin", stage: 5, since: "Link sent yesterday", amount: "$4,200", opened: false, returning: false, review: false },
  { name: "Owen Fletcher", init: "OF", service: "Roof repair", address: "4100 Sawmill Rd, Columbus", stage: 6, since: "Today 3:00 PM", amount: "$2,900", opened: true, returning: true, review: true },
  { name: "Whitmore Dental", init: "WD", service: "Flat roof patch", address: "1200 Bethel Rd, Columbus", stage: 6, since: "Yesterday", amount: "$2,350", opened: false, returning: false, review: false },
  { name: "Kate Morgan", init: "KM", service: "Shingle repair", address: "19 Sunbury Rd, Westerville", stage: 6, since: "Monday", amount: "$1,850", opened: true, returning: true, review: false },
  { name: "Elm Street HOA", init: "EH", service: "Roof coating", address: "700 Elm St, Columbus", stage: 6, since: "Tuesday", amount: "$9,600", opened: false, returning: false, review: true },
  { name: "Victor Hale", init: "VH", service: "Skylight install", address: "245 Frantz Rd, Dublin", stage: 6, since: "Wednesday", amount: "$5,400", opened: true, returning: true, review: false },
  { name: "Rosa Diaz", init: "RD", service: "Gutter replacement", address: "58 Norwich St, Hilliard", stage: 6, since: "Thursday", amount: "$3,300", opened: false, returning: false, review: false },
  { name: "Bright Daycare", init: "BD", service: "Roof repair", address: "655 Morse Rd, Columbus", stage: 8, since: "14 days late", amount: "$9,400", opened: true, returning: true, review: true },
  { name: "Grace Whitfield", init: "GW", service: "Gutter replacement", address: "37 Kenny Rd, Columbus", stage: 8, since: "6 days late", amount: "$4,850", opened: false, returning: false, review: false },
  { name: "Paul Ortega", init: "PO", service: "Roof replacement", address: "88 Linden Ave, Columbus", stage: 8, since: "Due Nov 20", amount: "$9,500", opened: true, returning: true, review: false },
  { name: "Ivy Chen", init: "IC", service: "Roof inspection", address: "120 State St, Columbus", stage: 9, since: "Check-in in January", amount: "", opened: false, returning: false, review: true },
  { name: "Omar Haddad", init: "OH", service: "Gutter cleaning", address: "120 State St, Columbus", stage: 9, since: "Check-in in February", amount: "", opened: true, returning: true, review: false },
  { name: "Lena Fox", init: "LF", service: "Roof repair", address: "2210 Neil Ave, Columbus", stage: 9, since: "Check-in in March", amount: "", opened: false, returning: false, review: false },
  { name: "Sam Ortiz", init: "SO", service: "Skylight leak", address: "120 State St, Columbus", stage: 9, since: "Check-in in March", amount: "", opened: true, returning: true, review: true },
  { name: "Ruth Bell", init: "RB", service: "Roof coating", address: "120 State St, Columbus", stage: 9, since: "Check-in in April", amount: "", opened: false, returning: false, review: false },
  { name: "Dale Price", init: "DP", service: "Roof replacement", address: "120 State St, Columbus", stage: 10, since: "Chose a competitor", amount: "", opened: true, returning: true, review: false },
  { name: "Mia Stone", init: "MS", service: "Gutter guards", address: "120 State St, Columbus", stage: 10, since: "Said no", amount: "", opened: false, returning: false, review: true },
  { name: "Cory Vance", init: "CV", service: "Shingle repair", address: "120 State St, Columbus", stage: 10, since: "Not a fit", amount: "", opened: true, returning: true, review: false },
  { name: "Jade Park", init: "JP", service: "Roof inspection", address: "120 State St, Columbus", stage: 10, since: "Opted out", amount: "", opened: false, returning: false, review: false },
  { name: "Priya Shah", init: "PS", service: "Gutter repair", address: "14 Elm Ct, Dublin", stage: 3, since: "Needs service and price", amount: "", opened: true, returning: true, review: true, quote: "need" },
];

// Cards of a stage that the board does not draw (the design shows 5 and 4 of them, and a count of the rest).
// Index = stage number.
export const MOCK_HIDDEN_COUNTS: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 37, 3];
