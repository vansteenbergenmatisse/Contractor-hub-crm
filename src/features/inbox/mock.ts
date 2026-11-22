// MOCK DATA (Phase 2). Sample conversations from the design. Every name, number and text here is
// made up. Replaced in Phase 3 by conversations from HighLevel. Business facts in the texts are
// tokens ({name}, {first}, {site}) filled from the business record, never written in here.
import type { Conversation, QuickReply } from "./types";

const day = (label: string) => ({ type: "day", label }) as const;

export const MOCK_CONVERSATIONS: readonly Conversation[] = [
  {
    id: "c1", initials: "MA", name: "Maria Alvarez", channel: "Call", time: "9:48 AM", needsReply: true, minutesWaiting: 14,
    sub: "Roof leak repair · New Lead", contact: "(614) 555-0134", phone: "(614) 555-0134", via: "by text",
    snippet: "Water is coming through my kitchen ceiling. Can someone come today?", lastIsOutgoing: false,
    thread: [
      day("Today"),
      { type: "event", icon: "call", text: "Missed call · 9:46 AM" },
      { type: "sys", text: "Hi Maria, this is {name}. Sorry we missed your call. How can we help?", time: "9:46 AM" },
      { type: "in", text: "Water is coming through my kitchen ceiling. Can someone come today?", time: "9:48 AM" },
    ],
  },
  {
    id: "c2", initials: "JR", name: "Jordan Reyes", channel: "Text", time: "9:05 AM", needsReply: true, minutesWaiting: 60,
    sub: "Gutter cleaning · New Lead", contact: "(614) 555-0178", phone: "(614) 555-0178", via: "by text",
    snippet: "22 Birch Ln in Dublin. Can you do Saturday?", lastIsOutgoing: false,
    thread: [
      day("Today"),
      { type: "in", text: "Hi, how much to clean the gutters on a 2-story house?", time: "9:02 AM" },
      { type: "sys", text: "Hi Jordan, thanks for reaching out to {name}. What is the address? We send you a price fast.", time: "9:02 AM" },
      { type: "in", text: "22 Birch Ln in Dublin. Can you do Saturday?", time: "9:05 AM" },
    ],
  },
  {
    id: "c3", initials: "NC", name: "Nina Castillo", channel: "Text", time: "Wed", needsReply: true, minutesWaiting: 2880,
    sub: "Skylight install · Quote Sent · $8,200", contact: "(614) 555-0121", phone: "(614) 555-0121", via: "by text",
    snippet: "Is $8,200 your best price? Another roofer quoted me $7,600.", lastIsOutgoing: false,
    thread: [
      day("Sat, Nov 7"),
      { type: "sys", text: "Hi Nina, your quote for the skylight install is ready: $8,200. Tap to view and accept.", time: "4:10 PM" },
      day("Mon, Nov 9"),
      { type: "sys", text: "Hi Nina, any questions about the quote? Happy to help.", time: "9:00 AM" },
      day("Wed, Nov 11"),
      { type: "in", text: "Is $8,200 your best price? Another roofer quoted me $7,600.", time: "8:10 AM" },
    ],
  },
  {
    id: "c4", initials: "DK", name: "Dana Kim", channel: "Facebook", time: "8:40 AM", needsReply: false, minutesWaiting: 70,
    sub: "Gutter guards · Following Up", contact: "Facebook: Dana Kim", via: "by Facebook message",
    snippet: "Yes, still thinking. I get back to you next week.", lastIsOutgoing: false,
    thread: [
      day("Today"),
      { type: "sys", text: "Hi Dana, still thinking about the gutter guards? Happy to answer any question.", time: "8:30 AM" },
      { type: "in", text: "Yes, still thinking. I get back to you next week.", time: "8:40 AM" },
    ],
  },
  {
    id: "c5", initials: "BD", name: "Bright Daycare", channel: "Email", time: "8:00 AM", needsReply: false, minutesWaiting: 130,
    sub: "Roof repair · Payment Due · $9,400", contact: "billing@brightdaycare.example", via: "by email",
    snippet: "System: Second reminder: invoice 1042 for $9,400 is now 14 days late.", lastIsOutgoing: true,
    thread: [
      day("Fri, Nov 6"),
      { type: "sys", text: "Reminder: invoice 1042 for $9,400 was due on Oct 30. You can pay online with the link in this email.", time: "8:00 AM" },
      day("Today"),
      { type: "sys", text: "Second reminder: invoice 1042 for $9,400 is now 14 days late.", time: "8:00 AM" },
    ],
  },
  {
    id: "c6", initials: "EN", name: "Ellen Novak", channel: "Web form", time: "7:12 AM", needsReply: false, minutesWaiting: 180,
    sub: "Skylight leak · New Lead", contact: "(614) 555-0165", phone: "(614) 555-0165", via: "by text",
    snippet: "System: Hi Ellen, thanks for your request. We got it. {first} calls you soon.", lastIsOutgoing: true,
    thread: [
      day("Today"),
      { type: "event", icon: "form", text: "Filled in the website form · 7:12 AM" },
      { type: "sys", text: "Hi Ellen, thanks for your request. We got it. {first} calls you soon.", time: "7:12 AM" },
    ],
  },
  {
    id: "c7", initials: "HB", name: "Hannah Brooks", channel: "Instagram", time: "Yesterday", needsReply: false, minutesWaiting: 1500,
    sub: "Roof inspection · Following Up", contact: "Instagram: hannah.brooks", via: "by Instagram message",
    snippet: "Let me check my week. I message you tomorrow.", lastIsOutgoing: false,
    thread: [
      day("Yesterday"),
      { type: "in", text: "Saw your roof check video. Do you come out to Powell?", time: "5:10 PM" },
      { type: "out", text: "Yes, we do. Want me to come by this week?", time: "5:25 PM" },
      { type: "in", text: "Let me check my week. I message you tomorrow.", time: "5:31 PM" },
    ],
  },
  {
    id: "c8", initials: "HR", name: "Harlan Realty", channel: "Email", time: "Yesterday", needsReply: false, minutesWaiting: 1700,
    sub: "Roof replacement · Quote Sent · $31,400", contact: "office@harlanrealty.example", via: "by email",
    snippet: "Thanks. Our board looks at it on Friday. We get back to you after that.", lastIsOutgoing: false,
    thread: [
      day("Yesterday"),
      { type: "sys", text: "Your quote for the roof replacement at 410 Elm St is ready: $31,400. View and accept it online.", time: "2:15 PM" },
      { type: "in", text: "Thanks. Our board looks at it on Friday. We get back to you after that.", time: "4:40 PM" },
    ],
  },
  {
    id: "c9", initials: "LP", name: "Linda Park", channel: "Text", time: "Yesterday", needsReply: false, minutesWaiting: 1300,
    sub: "Shingle repair · Estimate today 11:00 AM", contact: "(614) 555-0109", phone: "(614) 555-0109", via: "by text",
    snippet: "System: Thanks Linda. You are confirmed for 11:00 AM.", lastIsOutgoing: true,
    thread: [
      day("Yesterday"),
      { type: "sys", text: "Reminder: {first} from {name} visits tomorrow at 11:00 AM. Reply C to confirm.", time: "11:00 AM" },
      { type: "in", text: "C", time: "11:20 AM" },
      { type: "sys", text: "Thanks Linda. You are confirmed for 11:00 AM.", time: "11:20 AM" },
    ],
  },
];

export const MOCK_QUICK_REPLIES: readonly QuickReply[] = [
  { label: "Call in 10 min", text: "I call you in 10 minutes." },
  { label: "Booking link", text: "Here is the link to pick your job date: {site}/book" },
  { label: "Thanks", text: "Thanks, got it." },
];

// Conversations that need a reply in the mock. The layout can feed this to the tab badge.
export const INBOX_WAITING_COUNT: number = MOCK_CONVERSATIONS.filter((c) => c.needsReply).length;
