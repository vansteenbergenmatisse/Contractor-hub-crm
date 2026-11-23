import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { createCalendarRequests, parseLocationTimeZone } from "./calendar";
import { getTokenService } from "./routes";
import { withStoredLocationToken } from "./stored-token";

// The location's time zone alone: one GET /locations/{id}, so a page that only needs the zone does not
// spend the calendar limit. Optional by design: any failure answers null and the page uses the viewer's zone.
// Proposals, not measured numbers.
export const LOCATION_ZONE_TIMEOUT_MS = 2_000;
export const LOCATION_ZONE_READS_PER_MINUTE = 30;
const LOCATION_ZONE_WINDOW_MS = 60_000;
const LOCATION_ZONE_CACHE_MS = 60 * 60 * 1000;
const LOCATION_ZONE_CACHE_MAX = 500;
const MAX_LOCATION_RESPONSE_BYTES = 1024 * 1024;

type WithToken = (tenantId: string, call: (accessToken: string) => Promise<Response>) => Promise<Response>;
type Hit = (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;
export type LocationZoneRuntime = {
  readLocationId: (tenantId: string) => Promise<string | null>;
  withLocationToken: WithToken;
  withStoredLocationToken: WithToken;
  request: (accessToken: string, locationId: string) => Promise<Response>;
};
export type LocationZoneCache = Map<string, { zone: string; expiresAt: number }>;
type Options = { cache?: LocationZoneCache; now?: () => Date; timeoutMs?: number; ttlMs?: number };

// Per server instance. A zone is not a secret and rarely changes.
const sharedCache: LocationZoneCache = new Map();

async function readBody(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_LOCATION_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error("too large");
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function remember(cache: LocationZoneCache, tenantId: string, zone: string, expiresAt: number) {
  cache.delete(tenantId);
  if (cache.size >= LOCATION_ZONE_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(tenantId, { zone, expiresAt });
}

// Counted before any env, token or HighLevel call. With `viewer` (an admin's read-only client view) the
// stored token is used, nothing is refreshed or minted, and the count is the viewer's. Never throws and
// never takes longer than the time limit. Logs hold the step only.
export function buildLocationTimeZoneReader(runtime: () => LocationZoneRuntime, hit: Hit, viewer?: { viewerId: string }, options: Options = {}) {
  const cache = options.cache ?? sharedCache;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? LOCATION_ZONE_TIMEOUT_MS;
  const ttlMs = options.ttlMs ?? LOCATION_ZONE_CACHE_MS;

  async function read(tenantId: string): Promise<string | null> {
    let step = "limiter";
    try {
      const key = viewer ? `highlevel-location-zone-view:${viewer.viewerId}` : `highlevel-location-zone:${tenantId}`;
      if (!(await hit(key, LOCATION_ZONE_READS_PER_MINUTE, LOCATION_ZONE_WINDOW_MS, now()))) {
        console.error("HighLevel location zone read failed: step=throttled");
        return null;
      }
      step = "env";
      const rt = runtime();
      step = "location";
      const locationId = await rt.readLocationId(tenantId);
      if (!locationId) return null;
      step = "request";
      const withToken = viewer ? rt.withStoredLocationToken : rt.withLocationToken;
      const response = await withToken(tenantId, (token) => rt.request(token, locationId));
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        console.error(`HighLevel location zone read failed: step=request status=${response.status}`);
        return null;
      }
      step = "parse";
      const zone = parseLocationTimeZone(await readBody(response));
      if (!knownZone(zone)) {
        console.error("HighLevel location zone read failed: step=zone");
        return null;
      }
      remember(cache, tenantId, zone, now().getTime() + ttlMs);
      return zone;
    } catch {
      console.error(`HighLevel location zone read failed: step=${step}`);
      return null;
    }
  }

  return async (tenantId: string | null | undefined): Promise<string | null> => {
    if (!tenantId) return null;
    const cached = cache.get(tenantId);
    if (cached && cached.expiresAt > now().getTime()) return cached.zone;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    try {
      return await Promise.race([read(tenantId), limit]);
    } finally {
      clearTimeout(timer);
    }
  };
}

function defaultRuntime(): LocationZoneRuntime {
  const env = parseEnv("highlevel");
  const tokens = getTokenService();
  // The calendar's location request, with this read's shorter limit on the network call.
  const requests = createCalendarRequests(env.GHL_API_BASE_URL, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(LOCATION_ZONE_TIMEOUT_MS) }));
  return {
    readLocationId: async (id) => (await readLocationState(id, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    withLocationToken: tokens.withLocationToken,
    withStoredLocationToken,
    request: requests.location,
  };
}

export function createTenantLocationZoneReader(hit: Hit, viewer?: { viewerId: string }) {
  return buildLocationTimeZoneReader(defaultRuntime, hit, viewer);
}
