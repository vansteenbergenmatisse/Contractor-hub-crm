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

// Real data (read-only). The server page injects the reader, so this feature makes no HighLevel call.
type ReadFailure = { ok: false; reason: "reconnect" | "unavailable" };
export type InboxReader = {
  list: (tenantId: string) => Promise<
    | { ok: true; conversations: { id: string; name: string | null; lastMessageBody: string | null; lastMessageType: string | null; unreadCount: number }[]; dropped: number; complete: boolean }
    | ReadFailure
  >;
  thread: (tenantId: string, conversationId: string) => Promise<
    | { ok: true; messages: { id: string; direction: "inbound" | "outbound"; body: string | null; dateAdded: string; messageType: string | null }[]; dropped: number; complete: boolean }
    | ReadFailure
  >;
};
// `channel` is null for a type with no exact match in the design's six channels.
export type LiveConversation = { id: string; name: string; channel: Channel | null; snippet: string; unreadCount: number };
export type LiveMessage = { id: string; direction: "inbound" | "outbound"; body: string | null; at: string };
export type LiveThread =
  | { state: "ready"; messages: LiveMessage[]; complete: boolean; dropped: number }
  | { state: "empty" | "reconnect" | "unavailable" };
export type InboxResult =
  | { state: "ready"; conversations: LiveConversation[]; complete: boolean; dropped: number; selectedId: string | null; thread: LiveThread | null }
  | { state: "empty" | "reconnect" | "unavailable" };

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
  // What is typed in the reply box. Kept with the page, so it survives moving to another page (as in the
  // design); cleared when another conversation opens or the message is sent.
  draft: string;
};

export type InboxAction =
  | { type: "open"; id: string }
  | { type: "send"; text: string }
  | { type: "toggleDone" }
  // A row's own Mark done / Flag for reply (swipe left or its menu), whichever conversation is open.
  | { type: "toggleNeed"; id: string }
  | { type: "draft"; text: string }
  | { type: "toList" }
  | { type: "filter"; filter: Filter }
  | { type: "replyTo"; id: string }
  // A search result: show everyone when the filter hides the conversation (`hidden`), then open it.
  | { type: "show"; id: string; hidden: boolean };
