// Types shared inside the inbox feature.
export type Channel = "Call" | "Text" | "Email" | "Web form" | "Facebook" | "Instagram";

// How long someone has waited, as a tier: under 1 hour, 1 to 24 hours, 24 hours or more.
export type WaitTier = "warn" | "bad" | "hot";
export type Filter = "all" | WaitTier;

// One line of a thread. Day and event lines are separators; the rest are messages.
export type ThreadItem =
  | { type: "day"; label: string }
  | { type: "event"; icon: "call" | "form"; text: string }
  | { type: "in" | "sys" | "out"; text: string; time: string };

export type Conversation = {
  id: string;
  initials: string;
  name: string;
  channel: Channel;
  // Time of the newest message, as the list shows it.
  time: string;
  // True when the conversation waits on the owner.
  needsReply: boolean;
  // Minutes since the customer's newest message. The backend sends minutes, never a label.
  minutesWaiting: number;
  sub: string;
  // What the customer is reached on, as shown in the thread header.
  contact: string;
  // Only set when there is a phone number to dial.
  phone?: string;
  // "by text", "by email": where a reply goes.
  via: string;
  // Newest message as the list shows it. May hold {name}, {first}, {site} and {booking link}.
  snippet: string;
  // True when the owner's or the system's message is the newest one (shows Delivered or Seen).
  lastIsOutgoing: boolean;
  thread: readonly ThreadItem[];
};

export type QuickReply = { label: string; text: string };

// The business facts a sample text can use. Always from the business record, never hardcoded.
// A missing fact is "". `bookingLink` is the link a text can share, "" when the business has none.
export type TextBusiness = { name: string; first: string; site: string; bookingLink: string };

export type InboxEvent = "" | "open" | "send" | "done" | "list" | "flt";

export type InboxState = {
  needs: Readonly<Record<string, boolean>>;
  selected: string;
  // Phone: false shows the list, true shows the open conversation.
  open: boolean;
  filter: Filter;
  sent: Readonly<Record<string, readonly string[]>>;
  // Counters that restart a small animation when the same thing happens twice.
  bumps: number;
  swaps: number;
  event: InboxEvent;
};

export type InboxAction =
  | { type: "open"; id: string }
  | { type: "send"; text: string }
  | { type: "toggleDone" }
  | { type: "toList" }
  | { type: "filter"; filter: Filter }
  | { type: "replyTo"; id: string };
