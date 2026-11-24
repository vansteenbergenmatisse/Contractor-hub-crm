import { validateLead } from "./leads-logic";
import { isOrigin, ORIGIN_LABEL, originFromRaw } from "./lead-sources";
import type { AddressSuggestion } from "@/shared/lib/places-search";
import { buildLeadsCsv, type ExportRow } from "./leads-csv";
import { isLeadsReadDisabled } from "./read-flag";
import { canExportLeads } from "./export-access";

// HTTP handlers for Leads. Tenant and user come from the session only. Logs and audit lines hold ids
// and counts, never a name, phone, email, address or search text.
export type RouteUser = { id: string; role: "owner" | "office" | "admin"; tenantId: string | null; viewing?: boolean };
type Hit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;
type Base = { appOrigin: string; currentUser: (request: Request) => Promise<RouteUser | null>; hit: Hit; now: () => Date };

const HOUR_MS = 3_600_000;
// Proposals, not measured numbers.
export const EXPORTS_PER_HOUR = 10;
export const CREATES_PER_HOUR = 60;
export const ADDRESS_SEARCHES_PER_MINUTE = 60;
const MAX_BODY_BYTES = 4096;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "cache-control": "no-store", "content-type": "application/json" } });

const contentType = (request: Request) => (request.headers.get("content-type") ?? "").toLowerCase();

async function readText(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let raw = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    raw += decoder.decode(value, { stream: true });
  }
  return raw + decoder.decode();
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!contentType(request).startsWith("application/json") || !request.body) return null;
  const raw = await readText(request);
  if (raw === null) return null;
  try {
    const json: unknown = JSON.parse(raw);
    return typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function allowed(hit: Hit, key: string, limit: number, windowMs: number, now: Date): Promise<boolean> {
  try {
    return await hit(key, limit, windowMs, now);
  } catch {
    return false; // a limiter failure denies the call
  }
}

const audit = (event: string, fields: Record<string, string | number | boolean>) => console.info(JSON.stringify({ audit: event, ...fields }));

export type ExportContact = { name: string | null; source: string | null; dateAdded: string; phone: string | null; email: string | null; address: string | null };
export type ExportRead = { ok: true; contacts: readonly ExportContact[]; complete: boolean; dropped: number } | { ok: false };
export type LeadsExportDeps = Base & {
  read: (tenantId: string) => Promise<ExportRead>;
  readZone: (tenantId: string) => Promise<string | null>;
};

function dateIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.parse(iso));
}

// The page's form sends one optional box. Null when the body is too large or the box has another value.
async function readExportForm(request: Request): Promise<{ includeContact: boolean } | null> {
  const raw = await readText(request);
  if (raw === null) return null;
  const value = new URLSearchParams(raw).get("includeContact");
  return value === null || value === "1" ? { includeContact: value === "1" } : null;
}

async function readExportJson(request: Request): Promise<{ includeContact: boolean } | null> {
  const body = await readBody(request);
  if (!body || (body.includeContact !== undefined && typeof body.includeContact !== "boolean")) return null;
  return { includeContact: body.includeContact === true };
}

const isFormPost = (request: Request) => contentType(request).startsWith("application/x-www-form-urlencoded");
const backToLeads = (reason: "busy" | "failed") => new Response(null, { status: 303, headers: { "cache-control": "no-store", location: `/leads?export=${reason}` } });

// A form post without JavaScript lands on this answer, so it must be a page with a way back.
const FORBIDDEN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Export not available</title></head><body><h1>Export not available</h1><p>This account cannot export leads from here.</p><p><a href="/leads">Back to Leads</a></p></body></html>`;
const forbidden = (request: Request) => isFormPost(request)
  ? new Response(FORBIDDEN_PAGE, { status: 403, headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff" } })
  : reply(403, { error: "forbidden" });

// The answer when the export throws, also used by the route for a failure before the handler runs.
export function exportFailure(request: Request): Response {
  return isFormPost(request) ? backToLeads("failed") : reply(500, { error: "failed" });
}

export async function handleLeadsExport(request: Request, deps: LeadsExportDeps): Promise<Response> {
  try {
    return await runLeadsExport(request, deps);
  } catch {
    console.error("Lead export failed.");
    return exportFailure(request);
  }
}

async function runLeadsExport(request: Request, deps: LeadsExportDeps): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return forbidden(request);
  // A form post lands on this response, so a failure goes back to Leads with a reason to show.
  const isForm = isFormPost(request);
  const fail = (status: number, error: string, reason: "busy" | "failed" = "failed") => (isForm ? backToLeads(reason) : reply(status, { error }));
  const user = await deps.currentUser(request);
  if (!user) return fail(401, "unauthorized");
  if (!canExportLeads({ role: user.role, viewing: user.viewing, hasTenant: !!user.tenantId }) || !user.tenantId) return forbidden(request);
  // The same kill switch as the Leads page, checked before the limiter and any read.
  if (isLeadsReadDisabled()) return fail(503, "unavailable");
  const tenantId = user.tenantId;
  const options = await (isForm ? readExportForm(request) : readExportJson(request));
  if (!options) return fail(400, "invalid");
  const { includeContact } = options;
  const now = deps.now();
  if (!(await allowed(deps.hit, `leads-export:${tenantId}`, EXPORTS_PER_HOUR, HOUR_MS, now))) return fail(429, "rate_limited", "busy");
  const answer = await deps.read(tenantId).catch((): ExportRead => ({ ok: false }));
  if (!answer.ok) return fail(502, "unavailable");
  const zone = await deps.readZone(tenantId).catch(() => null);
  const rows: ExportRow[] = answer.contacts.map((c) => ({
    name: c.name ?? "Unnamed lead", source: ORIGIN_LABEL[originFromRaw(c.source)], date: dateIn(c.dateAdded, zone ?? "UTC"),
    phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "",
  }));
  const csv = buildLeadsCsv(rows, includeContact, zone ? "Date" : "Date (UTC)");
  const complete = answer.complete && answer.dropped === 0;
  audit("leads_export", { by: user.id, tenantId, rows: rows.length, dropped: answer.dropped, complete, contactFields: includeContact });
  // The name travels with a saved file, so a partial list still says it is one.
  const day = now.toISOString().slice(0, 10);
  const filename = complete ? `leads-${day}.csv` : `leads-partial-newest-${rows.length}-${day}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-content-type-options": "nosniff",
      "x-leads-rows": String(rows.length),
      "x-leads-complete": complete ? "1" : "0",
    },
  });
}

export type LeadCreateOutcome = { status: "created" } | { status: "duplicate" } | { status: "in_progress" } | { status: "invalid_phone" } | { status: "unsure" } | { status: "failed" };
export type LeadCreateInput = { name: string; phone: string; email: string; address: string; source: string };
export type LeadCreateDeps = Base & {
  isEnabled: (tenantId: string) => boolean;
  create: (tenantId: string, input: LeadCreateInput) => Promise<LeadCreateOutcome>;
};

const field = (value: unknown, max: number): string | null => {
  if (value === undefined) return "";
  return typeof value === "string" && value.length <= max ? value.trim() : null;
};

export async function handleLeadCreate(request: Request, deps: LeadCreateDeps): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return reply(403, { error: "forbidden" });
  const user = await deps.currentUser(request);
  if (!user) return reply(401, { error: "unauthorized" });
  if (user.viewing || (user.role !== "owner" && user.role !== "office") || !user.tenantId) return reply(403, { error: "forbidden" });
  const tenantId = user.tenantId;
  // With the flag off the route answers as if it did not exist.
  if (!deps.isEnabled(tenantId)) return reply(404, { error: "not_found" });
  const body = await readBody(request);
  if (!body) return reply(400, { error: "invalid" });
  const name = field(body.name, 120);
  const phone = field(body.phone, 40);
  const email = field(body.email, 200);
  const address = field(body.address, 300);
  if (name === null || phone === null || email === null || address === null || !isOrigin(body.source) || body.source === "unknown") return reply(400, { error: "invalid" });
  const { focus } = validateLead({ name, phone, email, addr: address, need: "" });
  if (focus) return reply(400, { error: "invalid" });
  if (!(await allowed(deps.hit, `leads-create:${tenantId}`, CREATES_PER_HOUR, HOUR_MS, deps.now()))) return reply(429, { error: "rate_limited" });
  const outcome = await deps.create(tenantId, { name, phone, email, address, source: ORIGIN_LABEL[body.source] }).catch((): LeadCreateOutcome => ({ status: "unsure" }));
  audit("lead_create", { by: user.id, tenantId, outcome: outcome.status });
  return reply(200, { status: outcome.status });
}

export type AddressSearchDeps = Base & {
  apiKey: string | undefined;
  search: (apiKey: string, input: string, sessionToken: string) => Promise<AddressSuggestion[]>;
};

const SESSION_TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

export async function handleAddressSearch(request: Request, deps: AddressSearchDeps): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return reply(403, { error: "forbidden" });
  const user = await deps.currentUser(request);
  if (!user) return reply(401, { error: "unauthorized" });
  if (user.viewing || (user.role !== "owner" && user.role !== "office") || !user.tenantId) return reply(403, { error: "forbidden" });
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) return reply(404, { error: "off" });
  const body = await readBody(request);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  const token = typeof body?.sessionToken === "string" ? body.sessionToken : "";
  if (input.length < 3 || input.length > 160 || !SESSION_TOKEN.test(token)) return reply(400, { error: "invalid" });
  if (!(await allowed(deps.hit, `leads-address:${user.tenantId}`, ADDRESS_SEARCHES_PER_MINUTE, 60_000, deps.now()))) return reply(429, { error: "rate_limited" });
  try {
    return reply(200, { suggestions: await deps.search(apiKey, input, token) });
  } catch {
    console.error("Address search failed.");
    return reply(502, { error: "unavailable" });
  }
}
