import { parseEnv } from "@/shared/config";
import { HighLevelHttpError } from "./client";
import { getTokenService } from "./routes";
import { withStoredLocationToken } from "./stored-token";
import { TokenServiceError } from "./token-service";
import { readLocationState } from "../db/token-store";

// Read-only. The official OpenAPI file names this Version for both endpoints; no real response has
// been seen (docs/greenlane/hl-api-notes.md).
const CONVERSATIONS_API_VERSION = "2021-04-15";
const REQUEST_TIMEOUT_MS = 10_000;
// Proposals, not measured numbers: the docs state no maximum for `limit`.
export const INBOX_CONVERSATIONS_LIMIT = 50;
export const INBOX_MESSAGES_LIMIT = 50;
export const INBOX_READS_PER_MINUTE = 60;
const INBOX_READ_WINDOW_MS = 60_000;
export const MAX_INBOX_RESPONSE_BYTES = 5 * 1024 * 1024;

export type HighLevelConversation = {
  id: string;
  name: string | null;
  lastMessageBody: string | null;
  lastMessageType: string | null;
  unreadCount: number;
};
export type HighLevelMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  dateAdded: string;
  messageType: string | null;
};
export type ConversationsPage = { conversations: HighLevelConversation[]; dropped: number; complete: boolean };
export type MessagesPage = { messages: HighLevelMessage[]; dropped: number; complete: boolean };
type ReadFailure = { ok: false; reason: "reconnect" | "unavailable" };
export type ConversationsRead = ({ ok: true } & ConversationsPage) | ReadFailure;
export type MessagesRead = ({ ok: true } & MessagesPage) | ReadFailure;
export type InboxAdapter = {
  list: (tenantId: string) => Promise<ConversationsRead>;
  thread: (tenantId: string, conversationId: string) => Promise<MessagesRead>;
};

class InboxBodyTooLargeError extends Error {}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

type RequestConfig = { baseUrl: string; fetch?: typeof fetch };

async function get(config: RequestConfig, url: string, accessToken: string): Promise<Response> {
  const doFetch = config.fetch ?? fetch;
  try {
    return await doFetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, version: CONVERSATIONS_API_VERSION, accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HighLevelHttpError("HighLevel conversations read could not reach HighLevel.", null);
  }
}

export function requestConversationSearch(config: RequestConfig, accessToken: string, locationId: string, limit: number): Promise<Response> {
  const query = new URLSearchParams({ locationId, limit: String(limit), sort: "desc", sortBy: "last_message_date" });
  return get(config, `${config.baseUrl.replace(/\/+$/, "")}/conversations/search?${query}`, accessToken);
}

export function requestConversationMessages(config: RequestConfig, accessToken: string, conversationId: string, limit: number): Promise<Response> {
  const base = config.baseUrl.replace(/\/+$/, "");
  return get(config, `${base}/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`, accessToken);
}

// Phone and email are documented on the row and deliberately not carried.
function parseConversation(raw: unknown, locationId: string): HighLevelConversation | null {
  const row = record(raw);
  if (!row) return null;
  const id = text(row.id);
  if (!id) return null;
  if (row.locationId !== undefined && row.locationId !== locationId) return null;
  const unread = row.unreadCount;
  return {
    id,
    name: text(row.contactName) ?? text(row.fullName),
    lastMessageBody: text(row.lastMessageBody),
    lastMessageType: text(row.lastMessageType),
    unreadCount: typeof unread === "number" && Number.isInteger(unread) && unread > 0 ? unread : 0,
  };
}

export function parseConversationSearch(json: unknown, locationId: string, limit: number): ConversationsPage {
  const body = record(json);
  if (!body || !Array.isArray(body.conversations)) throw new Error("HighLevel conversation search returned an unexpected response.");
  const conversations: HighLevelConversation[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of body.conversations.slice(0, limit)) {
    const row = parseConversation(raw, locationId);
    if (!row || seen.has(row.id)) dropped += 1;
    else {
      seen.add(row.id);
      conversations.push(row);
    }
  }
  const received = body.conversations.length;
  const total = typeof body.total === "number" ? body.total : null;
  const more = received > limit || (total !== null ? total > received : received >= limit);
  return { conversations, dropped, complete: !more };
}

// Activity lines and internal comments are not messages with the customer.
const isCustomerMessage = (type: string | null) => !type || !(type.startsWith("TYPE_ACTIVITY_") || type.startsWith("TYPE_INTERNAL_COMMENT"));

function parseMessage(raw: unknown, locationId: string, conversationId: string): HighLevelMessage | null {
  const row = record(raw);
  if (!row) return null;
  const id = text(row.id);
  const dateAdded = text(row.dateAdded);
  if (!id || !dateAdded || Number.isNaN(Date.parse(dateAdded))) return null;
  if (row.direction !== "inbound" && row.direction !== "outbound") return null;
  if (row.locationId !== undefined && row.locationId !== locationId) return null;
  if (row.conversationId !== undefined && row.conversationId !== conversationId) return null;
  return { id, direction: row.direction, body: text(row.body), dateAdded, messageType: text(row.messageType) };
}

// The sources disagree on the nesting: `messages[]` or `messages.messages[]`. Both are read.
export function parseConversationMessages(json: unknown, locationId: string, conversationId: string, limit: number): MessagesPage {
  const outer = record(json);
  const body = outer && Array.isArray(outer.messages) ? outer : record(outer?.messages);
  if (!body || !Array.isArray(body.messages)) throw new Error("HighLevel messages returned an unexpected response.");
  const messages: HighLevelMessage[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of body.messages.slice(0, limit)) {
    if (!isCustomerMessage(text(record(raw)?.messageType))) continue;
    const row = parseMessage(raw, locationId, conversationId);
    if (!row || seen.has(row.id)) dropped += 1;
    else {
      seen.add(row.id);
      messages.push(row);
    }
  }
  const received = body.messages.length;
  const more = received > limit || body.nextPage === true || (body.nextPage !== false && received >= limit);
  return { messages, dropped, complete: !more };
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_INBOX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new InboxBodyTooLargeError();
  }
  if (!response.body) throw new Error("HighLevel conversations read returned no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_INBOX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new InboxBodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

// Logs hold the step and the status only, never a row, a token or a response body.
function failure(error: unknown): ReadFailure {
  if (error instanceof TokenServiceError) {
    console.error(`HighLevel inbox read failed: step=token code=${error.code}`);
    return { ok: false, reason: error.code === "unavailable" ? "unavailable" : "reconnect" };
  }
  if (error instanceof HighLevelHttpError) {
    console.error(`HighLevel inbox read failed: step=request status=${error.status ?? "none"}`);
    return { ok: false, reason: error.status === 401 || error.status === 403 ? "reconnect" : "unavailable" };
  }
  console.error(`HighLevel inbox read failed: step=${error instanceof InboxBodyTooLargeError ? "size" : "parse"}`);
  return { ok: false, reason: "unavailable" };
}

type TokenCall = (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
type ReadDeps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  withToken: TokenCall;
  requestConversations: (accessToken: string, locationId: string, limit: number) => Promise<Response>;
  requestMessages: (accessToken: string, conversationId: string, limit: number) => Promise<Response>;
};

async function readJson(deps: ReadDeps, tenantId: string, call: (token: string) => Promise<Response>): Promise<unknown> {
  const response = await deps.withToken(tenantId, call);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new HighLevelHttpError("HighLevel conversations read failed.", response.status);
  }
  return readLimitedJson(response);
}

// One page, one attempt: a 429 is not retried during a page render.
export async function readInboxConversations(deps: ReadDeps, tenantId: string, limit = INBOX_CONVERSATIONS_LIMIT): Promise<ConversationsRead> {
  try {
    const locationId = await deps.readLocationId(tenantId);
    if (!locationId) return { ok: false, reason: "reconnect" };
    const json = await readJson(deps, tenantId, (token) => deps.requestConversations(token, locationId, limit));
    return { ok: true, ...parseConversationSearch(json, locationId, limit) };
  } catch (error) {
    return failure(error);
  }
}

export async function readInboxThread(deps: ReadDeps, tenantId: string, conversationId: string, limit = INBOX_MESSAGES_LIMIT): Promise<MessagesRead> {
  try {
    const locationId = await deps.readLocationId(tenantId);
    if (!locationId) return { ok: false, reason: "reconnect" };
    const json = await readJson(deps, tenantId, (token) => deps.requestMessages(token, conversationId, limit));
    return { ok: true, ...parseConversationMessages(json, locationId, conversationId, limit) };
  } catch (error) {
    return failure(error);
  }
}

type Hit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;
type ReaderDeps = Omit<ReadDeps, "withToken"> & {
  hit: Hit;
  now: () => Date;
  withLocationToken: TokenCall;
  withStoredLocationToken: TokenCall;
};
export type InboxViewer = { viewerId: string };

// Counts each read before any token or HighLevel call; a limiter failure denies the read. An admin's
// read-only client view uses the stored token only (no refresh, no store write) and its own counter,
// so it does not use this app's per-client limit. Its calls still count toward HighLevel's own limit.
export function buildInboxReader(deps: ReaderDeps, viewer?: InboxViewer): InboxAdapter {
  const key = (tenantId: string) => (viewer ? `highlevel-inbox-view:${viewer.viewerId}` : `highlevel-inbox:${tenantId}`);
  const read: ReadDeps = { ...deps, withToken: viewer ? deps.withStoredLocationToken : deps.withLocationToken };
  async function allowed(tenantId: string): Promise<boolean> {
    try {
      if (await deps.hit(key(tenantId), INBOX_READS_PER_MINUTE, INBOX_READ_WINDOW_MS, deps.now())) return true;
      console.error("HighLevel inbox read failed: step=throttled");
    } catch {
      console.error("HighLevel inbox read failed: step=limiter");
    }
    return false;
  }
  return {
    list: async (tenantId) => ((await allowed(tenantId)) ? readInboxConversations(read, tenantId) : { ok: false, reason: "unavailable" }),
    thread: async (tenantId, conversationId) => ((await allowed(tenantId)) ? readInboxThread(read, tenantId, conversationId) : { ok: false, reason: "unavailable" }),
  };
}

// The inbox reader for a server page. The tenant id always comes from the server session.
export function createTenantInboxReader(hit: Hit, viewer?: InboxViewer): InboxAdapter {
  const config = () => ({ baseUrl: parseEnv("highlevel").GHL_API_BASE_URL });
  return buildInboxReader(
    {
      hit,
      now: () => new Date(),
      readLocationId: async (id) => (await readLocationState(id, parseEnv("highlevel").TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
      withLocationToken: (tenantId, call) => getTokenService().withLocationToken(tenantId, call),
      withStoredLocationToken,
      requestConversations: (token, locationId, limit) => requestConversationSearch(config(), token, locationId, limit),
      requestMessages: (token, conversationId, limit) => requestConversationMessages(config(), token, conversationId, limit),
    },
    viewer,
  );
}
