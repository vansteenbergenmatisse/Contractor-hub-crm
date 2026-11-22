import { verifyWebhookSignature } from "./webhook-signature";
import { logError } from "./log-error";
import type {
  InstalledLocation,
  LocationToken,
  SaveLocationConnectionInput,
  WebhookEventInput,
} from "../types";

// Optional side effects after the core handling (tenant row and token). They never decide the
// answer to HighLevel for user and location events: a failure is logged and the event is still
// acknowledged, because the periodic sync repairs whatever a hook missed.
export type WebhookHooks = {
  // A location was installed and its token saved: create its CRM users. Errors are logged, not fatal.
  onLocationConnected?(input: { tenantId: string; companyId: string; locationId: string; accessToken: string }): Promise<void>;
  onLocationUpdate?(input: { locationId: string; name: string | null }): Promise<void>;
  // UserCreate, UserUpdate or UserDelete in a sub-account: only a trigger; the hook re-reads the users.
  onUserEvent?(input: { type: string; locationId: string }): Promise<void>;
};

export type WebhookDeps = {
  appId: string;
  publicKeyPem?: string; // tests only; production uses HighLevel's published key
  now: () => Date;
  newId: () => string;
  store: {
    begin(event: WebhookEventInput): Promise<"process" | "duplicate">;
    markProcessed(webhookId: string, now: Date): Promise<void>;
    readAgencyAccessToken(companyId: string, now: Date): Promise<string | null>;
    saveLocationConnection(input: SaveLocationConnectionInput): Promise<{ tenantId: string }>;
    markLocationUninstalled(locationId: string, now: Date): Promise<void>;
    deleteAgencyConnection(companyId: string): Promise<void>;
  };
  client: {
    mintLocationToken(agencyAccessToken: string, companyId: string, locationId: string): Promise<LocationToken>;
  };
  hooks?: WebhookHooks;
  // Optional: when present, a signed INSTALL or UNINSTALL is confirmed against HighLevel's own list of
  // installed locations before it acts (a replayed or very late event must not change anything). The
  // route wiring always provides it; it is optional only so the handler can be tested without it.
  reconcile?: {
    listInstalledLocations(agencyAccessToken: string, companyId: string): Promise<InstalledLocation[]>;
    // The company of a stored tenant, for an UNINSTALL whose payload has none.
    readLocationCompanyId(locationId: string): Promise<string | null>;
  };
};

const MAX_BODY_BYTES = 1_000_000;
const NO_STORE = { "cache-control": "no-store" };
const reply = (status: number) => new Response(null, { status, headers: NO_STORE });
const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

// Order matters: size, signature on the raw body, then JSON, appId, idempotency, action.
// Answers carry no body. 2xx means "received": HighLevel stops retrying. 500 means "try again".
export async function handleWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return reply(413);
  const rawBody = await request.text();
  // Bytes, not characters. A chunked body is still read in full first; the platform body limit is
  // the hard cap (recorded in PROGRESS.md).
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return reply(413);

  // Only the current header counts. The legacy RSA header (X-WH-Signature) is deprecated.
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-ghl-signature"), deps.publicKeyPem)) {
    return reply(401);
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return reply(400);
    payload = parsed as Record<string, unknown>;
  } catch {
    return reply(400);
  }
  const type = text(payload.type);
  if (!type) return reply(400);

  // An event for another app (for example the live app on the test URL) is acknowledged and dropped.
  // The location and user events carry no appId in HighLevel's schemas (read 2026-11-22), so for
  // those four types a MISSING appId is accepted (a present, different one is still dropped). Their
  // handling only re-reads data from HighLevel's API, so a stray event cannot change anything.
  const APP_LESS = type === "LocationUpdate" || type === "UserCreate" || type === "UserUpdate" || type === "UserDelete";
  if (payload.appId !== deps.appId && !(APP_LESS && payload.appId === undefined)) return reply(200);

  const locationId = text(payload.locationId);
  const companyId = text(payload.companyId);
  // INSTALL and UNINSTALL carry no webhookId in HighLevel's schema. Such an event gets its own id,
  // so a second UNINSTALL after a re-install is never mistaken for a repeat; the actions are safe to
  // run twice anyway.
  const webhookId = text(payload.webhookId) ?? `generated:${deps.newId()}`;
  const now = deps.now();

  try {
    const outcome = await deps.store.begin({ webhookId, type, locationId, companyId, payload });
    if (outcome === "duplicate") return reply(200);

    if (type === "INSTALL" && locationId && companyId) {
      const agencyToken = await deps.store.readAgencyAccessToken(companyId, now);
      // The token service refreshes an expired agency token; with none at all, retry later.
      if (!agencyToken) throw new Error("No usable agency token.");
      // A late retry of an old INSTALL, after the location was uninstalled, must not create a tenant.
      // Not listed yet could also be HighLevel catching up: answer 500 so it retries.
      if (deps.reconcile) {
        const listed = await deps.reconcile.listInstalledLocations(agencyToken, companyId);
        if (!listed.some((item) => item.locationId === locationId)) {
          throw new Error("Location is not listed as installed.");
        }
      }
      const token = await deps.client.mintLocationToken(agencyToken, companyId, locationId);
      const saved = await deps.store.saveLocationConnection({
        locationId,
        companyId,
        name: null,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: new Date(now.getTime() + token.expiresInSeconds * 1000),
      });
      await runHook("onLocationConnected", () =>
        deps.hooks?.onLocationConnected?.({ tenantId: saved.tenantId, companyId, locationId, accessToken: token.accessToken }),
      );
    } else if (type === "UNINSTALL") {
      if (locationId) {
        if (!(await isStillInstalled(deps, locationId, companyId, now))) {
          await deps.store.markLocationUninstalled(locationId, now);
        }
      } else if (companyId) await deps.store.deleteAgencyConnection(companyId);
    }
    else if (type === "LocationUpdate") {
      // The location's id is `id` in this event's schema.
      const id = text(payload.id) ?? locationId;
      if (id) await runHook("onLocationUpdate", () => deps.hooks?.onLocationUpdate?.({ locationId: id, name: text(payload.name) }));
    } else if (type === "UserCreate" || type === "UserUpdate" || type === "UserDelete") {
      if (locationId) await runHook("onUserEvent", () => deps.hooks?.onUserEvent?.({ type, locationId }));
    }
    await deps.store.markProcessed(webhookId, now);
    return reply(200);
  } catch (error) {
    // Name, redacted message, status, redacted body and stack go to the server log only.
    logError("HighLevel webhook failed", error);
    return reply(500);
  }
}

async function runHook(name: string, call: () => Promise<void> | undefined): Promise<void> {
  try {
    await call();
  } catch (error) {
    logError(`HighLevel webhook hook ${name} failed`, error);
  }
}

// A replayed signed UNINSTALL (captured, sent again after a re-install) must not switch a live tenant
// off. So the location is looked up in HighLevel's own list first. If it cannot be checked (company
// unknown, no agency token because the agency uninstalled) the signed event is trusted. If HighLevel
// fails while checking, this throws and the caller answers 500, so HighLevel retries.
async function isStillInstalled(
  deps: WebhookDeps,
  locationId: string,
  payloadCompanyId: string | null,
  now: Date,
): Promise<boolean> {
  const { reconcile } = deps;
  if (!reconcile) return false;
  // The stored tenant's agency wins; the payload's is only a fallback for an unknown tenant.
  const companyId = (await reconcile.readLocationCompanyId(locationId)) ?? payloadCompanyId;
  if (!companyId) return false;
  const agencyToken = await deps.store.readAgencyAccessToken(companyId, now);
  if (!agencyToken) return false;
  const listed = await reconcile.listInstalledLocations(agencyToken, companyId);
  return listed.some((item) => item.locationId === locationId);
}
