import { createHmac } from "node:crypto";
import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { parseContactSearch } from "./contacts";
import { getTokenService } from "./routes";

// Create one contact by hand, and read contacts for an export. Contract from HighLevel's OpenAPI file
// (apps/contacts.json): POST /contacts/ (contacts.write, Version 2021-07-28, only locationId required,
// answers 201 with { contact }) and GET /contacts/search/duplicate (contacts.readonly, locationId plus
// number or email). The duplicate search's 200 body has no published schema, so only an explicit
// { contact: null } or { contact: { id } } is believed. Anything else stops the create: an existing
// contact must never be overwritten or doubled. Upsert is never used, because it can update a contact.
const CONTACT_API_VERSION = "2021-07-28";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
// Proposal, not a measured number: at most this many pages of 100 per export.
export const EXPORT_MAX_PAGES = 5;
const EXPORT_PAGE_SIZE = 100;

export type NewContact = { name: string; phone: string; email: string; address: string; source: string };
export type ContactCreateOutcome =
  | { status: "created" } | { status: "duplicate" } | { status: "in_progress" } | { status: "invalid_phone" } | { status: "unsure" } | { status: "failed" };
export type ContactCreateRequests = {
  duplicate: (token: string, query: { locationId: string; number?: string; email?: string }) => Promise<Response>;
  create: (token: string, body: Record<string, unknown>) => Promise<Response>;
  search: (token: string, locationId: string, page: number, pageLimit: number) => Promise<Response>;
};
export type ContactCreateDeps = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  withToken: (tenantId: string, call: (token: string) => Promise<Response>) => Promise<Response>;
  requests: ContactCreateRequests;
};
export type ContactExportRow = { name: string | null; source: string | null; dateAdded: string; phone: string | null; email: string | null; address: string | null };
export type ContactExportRead = { ok: true; contacts: ContactExportRow[]; complete: boolean; dropped: number } | { ok: false };

// E.164 for the duplicate search and the create. Ten digits are read as a US number.
export function toE164(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function createContactCreateRequests(baseUrl: string, doFetch: typeof fetch = fetch): ContactCreateRequests {
  const base = baseUrl.replace(/\/+$/, "");
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, version: CONTACT_API_VERSION, accept: "application/json" });
  const json = (token: string) => ({ ...headers(token), "content-type": "application/json" });
  const signal = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return {
    duplicate: (token, query) => {
      const params = new URLSearchParams({ locationId: query.locationId });
      if (query.number) params.set("number", query.number);
      if (query.email) params.set("email", query.email);
      return doFetch(`${base}/contacts/search/duplicate?${params}`, { method: "GET", headers: headers(token), signal: signal() });
    },
    create: (token, body) => doFetch(`${base}/contacts/`, { method: "POST", headers: json(token), body: JSON.stringify(body), signal: signal() }),
    search: (token, locationId, page, pageLimit) => doFetch(`${base}/contacts/search`, {
      method: "POST", headers: json(token), signal: signal(),
      body: JSON.stringify({ locationId, page, pageLimit, sort: [{ field: "dateAdded", direction: "desc" }] }),
    }),
  };
}

async function readJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error("too large");
  }
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error("too large");
  return JSON.parse(body);
}

type Match = "none" | "found" | "unsure";

function readMatch(json: unknown): Match {
  if (typeof json !== "object" || json === null || Array.isArray(json) || !("contact" in json)) return "unsure";
  const contact = (json as { contact: unknown }).contact;
  if (contact === null) return "none";
  return typeof contact === "object" && typeof (contact as { id?: unknown }).id === "string" ? "found" : "unsure";
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function createContactCreateAdapter(deps: ContactCreateDeps) {
  async function lookup(tenantId: string, query: { locationId: string; number?: string; email?: string }): Promise<Match> {
    try {
      const response = await deps.withToken(tenantId, (token) => deps.requests.duplicate(token, query));
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return "unsure";
      }
      return readMatch(await readJson(response));
    } catch {
      return "unsure";
    }
  }

  // Searches by phone and by email on their own, because one search answers for only one of them.
  // One create attempt, never retried: a lost answer may still have created the contact.
  async function createContact(tenantId: string, input: NewContact): Promise<ContactCreateOutcome> {
    const phone = toE164(input.phone);
    if (!phone) return { status: "invalid_phone" };
    let locationId: string | null;
    try {
      locationId = await deps.readLocationId(tenantId);
    } catch {
      return { status: "failed" };
    }
    if (!locationId) return { status: "failed" };
    const checks = [lookup(tenantId, { locationId, number: phone })];
    if (input.email) checks.push(lookup(tenantId, { locationId, email: input.email }));
    const matches = await Promise.all(checks);
    if (matches.includes("found")) return { status: "duplicate" };
    if (matches.includes("unsure")) return { status: "failed" };
    const body: Record<string, unknown> = { locationId, name: input.name, phone, source: input.source };
    if (input.email) body.email = input.email;
    if (input.address) body.address1 = input.address;
    try {
      const response = await deps.withToken(tenantId, (token) => deps.requests.create(token, body));
      await response.body?.cancel().catch(() => {});
      if (response.ok) return { status: "created" };
      console.error(`Lead create failed: status=${response.status}`);
      return response.status >= 500 ? { status: "unsure" } : { status: "failed" };
    } catch {
      console.error("Lead create failed: no answer");
      return { status: "unsure" };
    }
  }

  // Pages through contacts. Whether HighLevel honors `page` is not documented, so a page that brings
  // only ids already seen stops the read and the export is marked as not complete.
  async function readForExport(tenantId: string, ownEmail?: string | null): Promise<ContactExportRead> {
    try {
      const locationId = await deps.readLocationId(tenantId);
      if (!locationId) return { ok: false };
      const seen = new Map<string, ContactExportRow>();
      let dropped = 0;
      let complete = false;
      for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
        const response = await deps.withToken(tenantId, (token) => deps.requests.search(token, locationId, page, EXPORT_PAGE_SIZE));
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          return { ok: false };
        }
        const json = await readJson(response);
        const parsed = parseContactSearch(json, locationId, EXPORT_PAGE_SIZE, ownEmail);
        const received = (json as { contacts: unknown[] }).contacts;
        const raw = new Map<string, Record<string, unknown>>();
        for (const row of received) {
          if (typeof row === "object" && row !== null && typeof (row as { id?: unknown }).id === "string") raw.set((row as { id: string }).id.trim(), row as Record<string, unknown>);
        }
        dropped += parsed.dropped;
        let added = 0;
        for (const c of parsed.contacts) {
          if (seen.has(c.id)) continue;
          added += 1;
          const place = [c.city, [c.state, c.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
          seen.set(c.id, {
            name: c.name, source: c.source, dateAdded: c.dateAdded, phone: text(raw.get(c.id)?.phone), email: text(raw.get(c.id)?.email),
            address: [c.address, place].filter(Boolean).join(", ") || null,
          });
        }
        // An empty or short page is the last one. On page 1 the answer's own total also says so.
        if (received.length === 0 || (page === 1 && parsed.complete) || (added > 0 && received.length < EXPORT_PAGE_SIZE)) {
          complete = true;
          break;
        }
        if (added === 0) break;
      }
      return { ok: true, contacts: [...seen.values()], complete, dropped };
    } catch {
      console.error("Lead export read failed.");
      return { ok: false };
    }
  }

  return { createContact, readForExport };
}

// One key per normalized phone and email, scoped to the tenant. Keyed with a server secret because a
// plain hash of a phone number can be reversed by trying every number. Null when the phone is invalid.
export function contactClaimKeys(secret: string, tenantId: string, phone: string, email: string): string[] | null {
  const e164 = toE164(phone);
  if (!e164) return null;
  const key = (kind: string, value: string) =>
    `lead-create:${tenantId}:${createHmac("sha256", secret).update(`lead-create-claim\0${tenantId}\0${kind}\0${value}`).digest("hex")}`;
  const normalizedEmail = email.trim().toLowerCase();
  return normalizedEmail ? [key("phone", e164), key("email", normalizedEmail)] : [key("phone", e164)];
}

export type ContactOnceDeps = {
  secret: string;
  claim: (key: string) => Promise<boolean>;
  create: (tenantId: string, input: NewContact) => Promise<ContactCreateOutcome>;
};

// Closes the gap between the duplicate search and the create. The claim is atomic and is never
// released early: it outlives the create, so a retry after a lost answer cannot double the contact.
export async function createContactOnce(tenantId: string, input: NewContact, deps: ContactOnceDeps): Promise<ContactCreateOutcome> {
  const keys = contactClaimKeys(deps.secret, tenantId, input.phone, input.email);
  if (!keys) return { status: "invalid_phone" };
  try {
    for (const key of keys) {
      if (!(await deps.claim(key))) return { status: "in_progress" };
    }
  } catch {
    console.error("Lead create claim failed.");
    return { status: "failed" };
  }
  return deps.create(tenantId, input);
}

// Proposal, not a measured number: longer than the searches, the create and a token renewal together.
export const CONTACT_CLAIM_MS = 120_000;
type ClaimHit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;

export function createTenantContactCreator(hit: ClaimHit) {
  const env = parseEnv("highlevel");
  const adapter = createTenantContactCreateAdapter();
  return (tenantId: string, input: NewContact) => createContactOnce(tenantId, input, {
    secret: env.TOKEN_ENCRYPTION_KEY,
    claim: (key) => hit(key, 1, CONTACT_CLAIM_MS, new Date()),
    create: adapter.createContact,
  });
}

export function createTenantContactCreateAdapter() {
  const env = parseEnv("highlevel");
  return createContactCreateAdapter({
    readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    withToken: getTokenService().withLocationToken,
    requests: createContactCreateRequests(env.GHL_API_BASE_URL),
  });
}
