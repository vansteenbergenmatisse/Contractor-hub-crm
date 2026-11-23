import type { Channel, InboxReader, InboxResult, LiveThread } from "../types";

const CHANNELS: Readonly<Record<string, Channel>> = {
  TYPE_CALL: "Call", TYPE_IVR_CALL: "Call", TYPE_CUSTOM_CALL: "Call", TYPE_CAMPAIGN_CALL: "Call", TYPE_CAMPAIGN_MANUAL_CALL: "Call", TYPE_CAMPAIGN_VOICEMAIL: "Call",
  TYPE_SMS: "Text", TYPE_RCS: "Text", TYPE_CUSTOM_SMS: "Text", TYPE_CUSTOM_PROVIDER_SMS: "Text", TYPE_CAMPAIGN_SMS: "Text", TYPE_CAMPAIGN_MANUAL_SMS: "Text",
  TYPE_EMAIL: "Email", TYPE_CUSTOM_EMAIL: "Email", TYPE_CUSTOM_PROVIDER_EMAIL: "Email", TYPE_CAMPAIGN_EMAIL: "Email",
  TYPE_FACEBOOK: "Facebook", TYPE_CAMPAIGN_FACEBOOK: "Facebook", TYPE_FACEBOOK_COMMENT: "Facebook",
  TYPE_INSTAGRAM: "Instagram", TYPE_INSTAGRAM_COMMENT: "Instagram",
  TYPE_FORM_SUBMISSION: "Web form",
};

// Only exact, known types get a channel. Anything else stays unlabelled.
export function channelOfType(type: string | null | undefined): Channel | null {
  return (type && Object.hasOwn(CHANNELS, type) ? CHANNELS[type] : null) ?? null;
}

async function loadThread(tenantId: string, read: InboxReader, conversationId: string): Promise<LiveThread> {
  let answer;
  try {
    answer = await read.thread(tenantId, conversationId);
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Inbox: left out ${answer.dropped} malformed message rows.`);
  // No row on a cut-off read: messages may lie beyond it, so it must not read as empty.
  if (answer.messages.length === 0) return { state: answer.dropped > 0 || !answer.complete ? "unavailable" : "empty" };
  // The docs do not state the message order, so it is set here: oldest first, as a thread reads.
  const messages = answer.messages
    .map((m) => ({ id: m.id, direction: m.direction, body: m.body, at: m.dateAdded }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { state: "ready", messages, complete: answer.complete, dropped: answer.dropped };
}

// The inbox of one tenant, read by `read` (the server page passes its reader). The tenant comes from
// the server session. `row` is the URL's `inbox-<id>`: its thread is read only when that id is in this
// tenant's own list. Never sample data. INBOX_READ_DISABLED=true shows the unavailable state.
export async function loadInbox(tenantId: string | null | undefined, read: InboxReader, row: string | null | undefined): Promise<InboxResult> {
  if (!tenantId || process.env.INBOX_READ_DISABLED?.trim() === "true") return { state: "unavailable" };
  let answer;
  try {
    answer = await read.list(tenantId);
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Inbox: left out ${answer.dropped} malformed conversation rows.`);
  if (answer.conversations.length === 0) return { state: answer.dropped > 0 || !answer.complete ? "unavailable" : "empty" };
  const conversations = answer.conversations.map((c) => ({
    id: c.id,
    name: c.name ?? "Unnamed contact",
    channel: channelOfType(c.lastMessageType),
    snippet: c.lastMessageBody ?? "",
    unreadCount: c.unreadCount,
  }));
  const wanted = row?.startsWith("inbox-") ? row.slice("inbox-".length) : null;
  const selectedId = wanted && conversations.some((c) => c.id === wanted) ? wanted : null;
  const thread = selectedId ? await loadThread(tenantId, read, selectedId) : null;
  return { state: "ready", conversations, complete: answer.complete, dropped: answer.dropped, selectedId, thread };
}
