import { HighLevelHttpError } from "./client";
import { TokenServiceError } from "./token-service";
import type { ContactsPage, ContactsRead, HighLevelContact } from "../types";
import { readFailureReason } from "./read-failure";

export const CONTACTS_PAGE_SIZE = 100;
// Proposal, not a measured number: reads per tenant per minute, until real traffic is known.
export const CONTACTS_READS_PER_MINUTE = 60;
const CONTACTS_READ_WINDOW_MS = 60_000;
// Proposal, not a measured number: 5 MiB leaves ample room for one page of contacts.
export const MAX_CONTACTS_RESPONSE_BYTES = 5 * 1024 * 1024;

class ContactsBodyTooLargeError extends Error {}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// A row needs a string id and a readable dateAdded, and must belong to the location asked for (a
// row naming another location is never shown). The other fields are optional: the wrong type reads
// as missing, because the search response has not been confirmed on a real answer yet.
function parseRow(raw: unknown, locationId: string): HighLevelContact | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  const dateAdded = text(row.dateAdded);
  if (!id || !dateAdded || Number.isNaN(Date.parse(dateAdded))) return null;
  if (row.locationId !== undefined && row.locationId !== locationId) return null;
  const joined = [text(row.firstName), text(row.lastName)].filter(Boolean).join(" ");
  const full = text(row.contactName) ?? text(row.name);
  // The same name in lowercase: the first and last name carry the capitals the person typed.
  const lowered = !!full && full === full.toLowerCase() && full === joined.toLowerCase();
  return {
    id,
    name: lowered ? joined : full ?? (joined || null),
    address: text(row.address) ?? text(row.address1),
    city: text(row.city),
    state: text(row.state),
    postalCode: text(row.postalCode),
    source: text(row.source),
    dateAdded,
  };
}

// The business's own contact (its email, or its email used as the name) is not a lead. The email is
// only compared here and never leaves the parser.
function isOwnContact(raw: unknown, own: string): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const row = raw as Record<string, unknown>;
  return [row.email, row.contactName, row.name].some((value) => text(value)?.toLowerCase() === own);
}

// Unknown fields are ignored; a malformed row is dropped and counted. Throws when the answer has no
// contacts list. `total` (or `count`) and `hasMore` tell whether anything lies beyond this page.
// Only the first `pageLimit` rows are read; an answer with more counts as cut off.
export function parseContactSearch(json: unknown, locationId: string, pageLimit: number, ownEmail?: string | null): ContactsPage {
  const own = text(ownEmail)?.toLowerCase() ?? null;
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("HighLevel contact search returned an unexpected response.");
  }
  const body = json as Record<string, unknown>;
  if (!Array.isArray(body.contacts)) throw new Error("HighLevel contact search returned an unexpected response.");
  const contacts: HighLevelContact[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of body.contacts.slice(0, pageLimit)) {
    if (own && isOwnContact(raw, own)) continue;
    const row = parseRow(raw, locationId);
    if (!row || seen.has(row.id)) dropped += 1;
    else {
      seen.add(row.id);
      contacts.push(row);
    }
  }
  const received = body.contacts.length;
  const total = typeof body.total === "number" ? body.total : typeof body.count === "number" ? body.count : null;
  const more = received > pageLimit || body.hasMore === true || (total !== null ? total > received : body.hasMore !== false && received >= pageLimit);
  return { contacts, dropped, complete: !more };
}

type Deps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  withLocationToken: (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
  requestContactSearch: (accessToken: string, locationId: string, pageLimit: number) => Promise<Response>;
};

// Logs hold the step and the status only, never a row, a token or a response body.
function failure(error: unknown): ContactsRead {
  if (error instanceof TokenServiceError) {
    console.error(`HighLevel contacts read failed: step=token code=${error.code}`);
    return { ok: false, reason: error.code === "unavailable" ? "unavailable" : "reconnect" };
  }
  if (error instanceof HighLevelHttpError) {
    console.error(`HighLevel contacts read failed: step=search status=${error.status ?? "none"}`);
    return { ok: false, reason: readFailureReason(error.status) };
  }
  console.error(`HighLevel contacts read failed: step=${error instanceof ContactsBodyTooLargeError ? "size" : "parse"}`);
  return { ok: false, reason: "unavailable" };
}

// Reads the body as a stream and stops at the limit, so an oversized answer is never fully buffered.
async function readLimitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CONTACTS_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new ContactsBodyTooLargeError();
  }
  if (!response.body) throw new Error("HighLevel contact search returned no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CONTACTS_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new ContactsBodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

type ThrottleDeps = {
  // Answers true when the call is allowed; may throw when the counter cannot be reached.
  hit: (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;
  read: (tenantId: string) => Promise<ContactsRead>;
  now: () => Date;
};

// Counts the read per tenant before any token or HighLevel call. Over the limit, or when the counter
// fails, the page gets `unavailable`. A limiter failure denies the read (fail closed), as the
// limiter's existing callers do.
// `key` replaces the tenant's counter: an admin's client view has its own, so it never uses up the
// client's reads.
export async function readContactsThrottled(deps: ThrottleDeps, tenantId: string, key = `highlevel-contacts:${tenantId}`): Promise<ContactsRead> {
  let allowed: boolean;
  try {
    allowed = await deps.hit(key, CONTACTS_READS_PER_MINUTE, CONTACTS_READ_WINDOW_MS, deps.now());
  } catch {
    console.error("HighLevel contacts read failed: step=limiter");
    return { ok: false, reason: "unavailable" };
  }
  if (!allowed) {
    console.error("HighLevel contacts read failed: step=throttled");
    return { ok: false, reason: "unavailable" };
  }
  return deps.read(tenantId);
}

// One page, one attempt: a 429 is not retried during a page render. The only retry is the token
// service's single refresh after a 401.
export async function readContactsPage(deps: Deps, tenantId: string, pageLimit = CONTACTS_PAGE_SIZE, ownEmail?: string | null): Promise<ContactsRead> {
  try {
    const locationId = await deps.readLocationId(tenantId);
    if (!locationId) return { ok: false, reason: "reconnect" };
    const response = await deps.withLocationToken(tenantId, (token) => deps.requestContactSearch(token, locationId, pageLimit));
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new HighLevelHttpError("HighLevel contact search failed.", response.status);
    }
    return { ok: true, ...parseContactSearch(await readLimitedJson(response), locationId, pageLimit, ownEmail) };
  } catch (error) {
    return failure(error);
  }
}
