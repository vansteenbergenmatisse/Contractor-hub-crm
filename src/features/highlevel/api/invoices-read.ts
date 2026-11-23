import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { HighLevelHttpError } from "./client";
import { getTokenService } from "./routes";
import { withStoredLocationToken } from "./stored-token";
import { TokenServiceError } from "./token-service";

// Read-only invoices and payment transactions. Every call is a GET. Shapes come from the public
// OpenAPI files apps/invoices.json and apps/payments.json at commit 0af86a4; no real answer was seen.
// Amount units are not documented, so an amount is carried exactly as sent and never converted.
const BILLING_API_VERSION = "2021-07-28"; // the only value both files list for these paths
const REQUEST_TIMEOUT_MS = 10_000;
const BILLING_READ_WINDOW_MS = 60_000;
const INVOICE_STATUSES = ["draft", "sent", "payment_processing", "paid", "void", "partially_paid"] as const;

// Proposals, not measured numbers. The files state no maximum for `limit`.
export const BILLING_PAGE_SIZE = 100;
export const BILLING_MAX_PAGES = 3;
export const BILLING_READS_PER_MINUTE = 30;
export const MAX_BILLING_RESPONSE_BYTES = 5 * 1024 * 1024;

export type HighLevelInvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type HighLevelInvoice = {
  id: string;
  status: HighLevelInvoiceStatus | null;
  liveMode: boolean | null;
  name: string | null;
  number: string | null;
  contactName: string | null;
  currency: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: number | null;
  amountDue: number | null;
  amountPaid: number | null;
};
export type HighLevelTransaction = {
  id: string;
  contactName: string | null;
  currency: string | null;
  amount: number | null;
  amountRefunded: number | null;
  status: string | null;
  liveMode: boolean | null;
  createdAt: string | null;
};
export type BillingRead<T> =
  | { ok: true; rows: T[]; expected: number; dropped: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" };
export type BillingPage<T> = { rows: T[]; received: number; total: number; dropped: number };
export type BillingRequests = {
  invoices: (accessToken: string, locationId: string, offset: number) => Promise<Response>;
  transactions: (accessToken: string, locationId: string, offset: number) => Promise<Response>;
};
type WithToken = (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
export type BillingRuntime = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  withLocationToken: WithToken;
  withStoredLocationToken: WithToken;
  requests: BillingRequests;
};
type Hit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;
type Viewer = { viewerId: string };

class BillingBodyTooLargeError extends Error {}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const unexpected = () => new Error("HighLevel billing read returned an unexpected response.");
const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const currency = (value: unknown): string | null => {
  const code = text(value);
  return code && /^[A-Z]{3}$/.test(code) ? code : null;
};
function day(value: unknown): string | null {
  const raw = text(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const ms = Date.parse(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === raw ? raw : null;
}
function instant(value: unknown): string | null {
  const raw = text(value);
  if (!raw || !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
function invoiceNumber(value: unknown): string | null {
  // The file types this as a number with a string example, so both are read.
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  return text(value);
}
function invoiceStatus(value: unknown): HighLevelInvoiceStatus | null {
  return INVOICE_STATUSES.find((status) => status === value) ?? null;
}
const ownRow = (row: Record<string, unknown> | null, locationId: string): boolean =>
  !!row && row.altId === locationId && (row.altType === undefined || row.altType === "location");
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw unexpected();
  return value;
}

function parsePage<T>(list: unknown, totalValue: unknown, locationId: string, toRow: (row: Record<string, unknown>, id: string) => T): BillingPage<T> {
  if (!Array.isArray(list)) throw unexpected();
  const total = count(totalValue);
  const rows: T[] = [];
  let dropped = Math.max(0, list.length - BILLING_PAGE_SIZE);
  for (const raw of list.slice(0, BILLING_PAGE_SIZE)) {
    const row = record(raw);
    const id = text(row?._id);
    if (!row || !id || !ownRow(row, locationId)) dropped += 1;
    else rows.push(toRow(row, id));
  }
  return { rows, received: list.length, total, dropped };
}

// Only what the page shows is kept: no contact phone, email, address, line items or business details.
export function parseInvoicePage(json: unknown, locationId: string): BillingPage<HighLevelInvoice> {
  const body = record(json);
  return parsePage(body?.invoices, body?.total, locationId, (row, id) => ({
    id,
    status: invoiceStatus(row.status),
    liveMode: bool(row.liveMode),
    name: text(row.name),
    number: invoiceNumber(row.invoiceNumber),
    contactName: text(record(row.contactDetails)?.name),
    currency: currency(row.currency),
    issueDate: day(row.issueDate),
    dueDate: day(row.dueDate),
    total: amount(row.total),
    amountDue: amount(row.amountDue),
    amountPaid: amount(row.amountPaid),
  }));
}

// No email, IP address, charge snapshot, payment method or provider ids.
export function parseTransactionPage(json: unknown, locationId: string): BillingPage<HighLevelTransaction> {
  const body = record(json);
  return parsePage(body?.data, body?.totalCount, locationId, (row, id) => ({
    id,
    contactName: text(row.contactName),
    currency: currency(row.currency),
    amount: amount(row.amount),
    amountRefunded: amount(row.amountRefunded),
    status: text(row.status),
    liveMode: bool(row.liveMode),
    createdAt: instant(row.createdAt),
  }));
}

export function createBillingRequests(baseUrl: string, doFetch: typeof fetch = fetch): BillingRequests {
  const base = baseUrl.replace(/\/+$/, "");
  const get = async (path: string, accessToken: string): Promise<Response> => {
    try {
      return await doFetch(`${base}${path}`, {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}`, version: BILLING_API_VERSION, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HighLevelHttpError("HighLevel billing read could not reach HighLevel.", null);
    }
  };
  const paging = (locationId: string, offset: number) => ({ altId: locationId, altType: "location", limit: String(BILLING_PAGE_SIZE), offset: String(offset) });
  return {
    invoices: (token, locationId, offset) => get(`/invoices/?${new URLSearchParams({ ...paging(locationId, offset), sortField: "issueDate", sortOrder: "descend" })}`, token),
    transactions: (token, locationId, offset) => get(`/payments/transactions?${new URLSearchParams(paging(locationId, offset))}`, token),
  };
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BILLING_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new BillingBodyTooLargeError();
  }
  if (!response.body) throw unexpected();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BILLING_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new BillingBodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

// Logs hold the step and the status only, never a row, an id, a token or a response body.
function failure(label: string, error: unknown): { ok: false; reason: "reconnect" | "unavailable" } {
  if (error instanceof TokenServiceError) {
    console.error(`HighLevel ${label} read failed: step=auth code=${error.code}`);
    return { ok: false, reason: error.code === "unavailable" ? "unavailable" : "reconnect" };
  }
  if (error instanceof HighLevelHttpError) {
    console.error(`HighLevel ${label} read failed: step=request status=${error.status ?? "none"}`);
    return { ok: false, reason: error.status === 401 || error.status === 403 ? "reconnect" : "unavailable" };
  }
  console.error(`HighLevel ${label} read failed: step=${error instanceof BillingBodyTooLargeError ? "size" : "parse"}`);
  return { ok: false, reason: "unavailable" };
}

// All or nothing per read: a failed page fails it. `complete` is true only when the rows received
// add up exactly to the documented total, with nothing dropped, repeated or moved between pages.
async function readAllPages<T extends { id: string }>(
  label: string,
  rt: { readLocationId: BillingRuntime["readLocationId"]; withToken: WithToken },
  tenantId: string,
  request: (token: string, locationId: string, offset: number) => Promise<Response>,
  parse: (json: unknown, locationId: string) => BillingPage<T>,
): Promise<BillingRead<T>> {
  try {
    const locationId = await rt.readLocationId(tenantId);
    if (!locationId) return { ok: false, reason: "reconnect" };
    const rows: T[] = [];
    const seen = new Set<string>();
    let received = 0;
    let dropped = 0;
    let expected: number | null = null;
    let moved = false;
    for (let page = 0; page < BILLING_MAX_PAGES; page += 1) {
      const offset = received;
      const response = await rt.withToken(tenantId, (token) => request(token, locationId, offset));
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new HighLevelHttpError("HighLevel billing read failed.", response.status);
      }
      const parsed = parse(await readLimitedJson(response), locationId);
      if (expected !== null && parsed.total !== expected) moved = true;
      expected = parsed.total;
      received += parsed.received;
      dropped += parsed.dropped;
      for (const row of parsed.rows) {
        if (seen.has(row.id)) dropped += 1;
        else {
          seen.add(row.id);
          rows.push(row);
        }
      }
      if (parsed.received === 0 || received >= expected) break;
    }
    const total = expected ?? 0;
    return { ok: true, rows, expected: total, dropped, complete: !moved && dropped === 0 && received === total && rows.length === total };
  } catch (error) {
    return failure(label, error);
  }
}

// The read behind a limit, counted before any env, token or HighLevel call; a limiter failure denies
// it. With `viewer` (an admin's client view) the stored token is used and the count is the viewer's.
function limited<T>(label: string, keyName: string, runtime: () => BillingRuntime, hit: Hit, viewer: Viewer | undefined, run: (rt: BillingRuntime, withToken: WithToken, tenantId: string) => Promise<BillingRead<T>>) {
  return async (tenantId: string): Promise<BillingRead<T>> => {
    const key = viewer ? `highlevel-${keyName}-view:${viewer.viewerId}` : `highlevel-${keyName}:${tenantId}`;
    let allowed: boolean;
    try {
      allowed = await hit(key, BILLING_READS_PER_MINUTE, BILLING_READ_WINDOW_MS, new Date());
    } catch {
      console.error(`HighLevel ${label} read failed: step=limiter`);
      return { ok: false, reason: "unavailable" };
    }
    if (!allowed) {
      console.error(`HighLevel ${label} read failed: step=throttled`);
      return { ok: false, reason: "unavailable" };
    }
    let rt: BillingRuntime;
    try {
      rt = runtime();
    } catch {
      console.error(`HighLevel ${label} read failed: step=env`);
      return { ok: false, reason: "unavailable" };
    }
    return run(rt, viewer ? rt.withStoredLocationToken : rt.withLocationToken, tenantId);
  };
}

export function buildInvoicesReader(runtime: () => BillingRuntime, hit: Hit, viewer?: Viewer) {
  return limited<HighLevelInvoice>("invoices", "invoices", runtime, hit, viewer, (rt, withToken, tenantId) =>
    readAllPages("invoices", { readLocationId: rt.readLocationId, withToken }, tenantId, rt.requests.invoices, parseInvoicePage));
}

export function buildTransactionsReader(runtime: () => BillingRuntime, hit: Hit, viewer?: Viewer) {
  return limited<HighLevelTransaction>("transactions", "payments", runtime, hit, viewer, (rt, withToken, tenantId) =>
    readAllPages("transactions", { readLocationId: rt.readLocationId, withToken }, tenantId, rt.requests.transactions, parseTransactionPage));
}

function defaultRuntime(): BillingRuntime {
  const env = parseEnv("highlevel");
  const tokens = getTokenService();
  return {
    readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    withLocationToken: tokens.withLocationToken,
    withStoredLocationToken,
    requests: createBillingRequests(env.GHL_API_BASE_URL),
  };
}

export function createTenantInvoicesReader(hit: Hit, viewer?: Viewer) {
  return buildInvoicesReader(defaultRuntime, hit, viewer);
}

export function createTenantTransactionsReader(hit: Hit, viewer?: Viewer) {
  return buildTransactionsReader(defaultRuntime, hit, viewer);
}
