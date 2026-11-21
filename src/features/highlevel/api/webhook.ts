import { verifyWebhookSignature } from "./webhook-signature";
import type { LocationToken, SaveLocationConnectionInput, WebhookEventInput } from "../types";

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
  if (payload.appId !== deps.appId) return reply(200);

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
      // Refreshing an expired agency token is the token service (ticket 5). Until then: retry later.
      if (!agencyToken) throw new Error("No usable agency token.");
      const token = await deps.client.mintLocationToken(agencyToken, companyId, locationId);
      await deps.store.saveLocationConnection({
        locationId,
        companyId,
        name: null,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: new Date(now.getTime() + token.expiresInSeconds * 1000),
      });
    } else if (type === "UNINSTALL") {
      if (locationId) await deps.store.markLocationUninstalled(locationId, now);
      else if (companyId) await deps.store.deleteAgencyConnection(companyId);
    }
    await deps.store.markProcessed(webhookId, now);
    return reply(200);
  } catch (error) {
    // Type only: a message could hold a token, an id or a query value.
    console.error("HighLevel webhook failed:", error instanceof Error ? error.name : "unknown error");
    return reply(500);
  }
}
