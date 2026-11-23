import type { AppointmentContactQuery, AppointmentContactRead, ContactTagOutcome, ContactTagState } from "@/features/highlevel";
import type { NotifyOutcome, NotifyRefusal, RouteEventRow, RoutesReader } from "../types";
import { loadRoutes } from "./load-routes";
import { isNotifiableCalendar } from "./notify-rule";
import { toNotifyOutcome } from "./notify-view";

const MAX_BODY_BYTES = 1024;
const HOUR_MS = 60 * 60 * 1000;
const APPOINTMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
// Proposals, not measured numbers. One tap is one request.
export const NOTIFY_PER_HOUR_PER_USER = 30;
export const NOTIFY_PER_HOUR_PER_TENANT = 120;

type NotifyUser = { id: string; role: "owner" | "office" | "admin"; tenantId: string | null; viewing?: boolean };
export type NotifyStartDeps = {
  appOrigin: string;
  currentUser: (request: Request) => Promise<NotifyUser | null>;
  isEnabled: (tenantId: string) => boolean;
  hit: (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;
  read: RoutesReader;
  now: () => Date;
  readAppointmentContact: (tenantId: string, query: AppointmentContactQuery) => Promise<AppointmentContactRead>;
  readContactTagState: (tenantId: string, contactId: string) => Promise<ContactTagState>;
  pulseTag: (tenantId: string, contactId: string, hasTag: boolean) => Promise<ContactTagOutcome>;
  readOutcome: (tenantId: string, appointmentId: string) => Promise<string | null>;
  claim: (input: { tenantId: string; appointmentId: string; actorId: string }) => Promise<boolean>;
  finish: (tenantId: string, appointmentId: string, outcome: NotifyOutcome) => Promise<void>;
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "cache-control": "no-store", "content-type": "application/json" } });
const refused = (reason: NotifyRefusal) => reply(200, { status: "refused", reason });
const settled = (outcome: NotifyOutcome) => reply(200, { status: outcome });

export const notifyFailure = () => reply(500, { error: "failed" });

async function readAppointmentId(request: Request): Promise<string | null> {
  if (!request.body) return null;
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
  let json: unknown;
  try {
    json = JSON.parse(raw + decoder.decode());
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json) || Object.keys(json).length !== 1) return null;
  const id = (json as { appointmentId?: unknown }).appointmentId;
  return typeof id === "string" && APPOINTMENT_ID.test(id) ? id : null;
}

type Verified = { contactId: string; hasTag: boolean } | { refusal: NotifyRefusal };

// The browser's id is only a question. Today's appointments are read again for the session's tenant,
// with the same logic the page uses, and the id must be the real next job with a real contact.
async function verify(deps: NotifyStartDeps, tenantId: string, appointmentId: string): Promise<Verified> {
  let rows: RouteEventRow[] = [];
  let day: { startMs: number; endMs: number } | null = null;
  const capture: RoutesReader = async (tenant, boundsFor) => {
    const answer = await deps.read(tenant, boundsFor);
    if (answer.ok) {
      rows = answer.events;
      day = answer.range;
    }
    return answer;
  };
  const result = await loadRoutes(tenantId, capture, deps.now);
  if (result.state !== "ready" || !day) return { refusal: "unavailable" };
  if (result.partial) return { refusal: "unsure_next" };
  if (result.nextId !== appointmentId) return { refusal: "not_next" };
  const job = result.jobs.find((item) => item.id === appointmentId);
  const row = rows.find((item) => item.id === appointmentId);
  if (!job || !row) return { refusal: "not_next" };
  if (!isNotifiableCalendar(row.calendarName)) return { refusal: "wrong_type" };
  if (job.pastTime) return { refusal: "past" };
  const { startMs, endMs } = day as { startMs: number; endMs: number };
  const contact = await deps.readAppointmentContact(tenantId, { calendarId: row.calendarId, appointmentId, startMs, endMs });
  if (!contact.ok) return { refusal: "unavailable" };
  if (!contact.contactId) return { refusal: "no_contact" };
  const tags = await deps.readContactTagState(tenantId, contact.contactId);
  if (!tags.ok) return { refusal: "unavailable" };
  return { contactId: contact.contactId, hasTag: tags.hasTag };
}

const OUTCOMES: Record<ContactTagOutcome, NotifyOutcome> = { sent: "notified", failed: "failed", no_answer: "unconfirmed" };

// User and tenant come from the session only. Client users only: an admin, also in View as client, is
// refused. With the flag off the route answers as if it did not exist.
export async function handleNotifyStart(request: Request, deps: NotifyStartDeps): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return reply(403, { error: "forbidden" });
  const user = await deps.currentUser(request);
  if (!user) return reply(401, { error: "unauthorized" });
  if (user.viewing || (user.role !== "owner" && user.role !== "office") || !user.tenantId) return reply(403, { error: "forbidden" });
  const tenantId = user.tenantId;
  if (!deps.isEnabled(tenantId)) return reply(404, { error: "not_found" });
  let allowed = false;
  try {
    const now = deps.now();
    allowed = await deps.hit(`routes-notify-user:${user.id}`, NOTIFY_PER_HOUR_PER_USER, HOUR_MS, now)
      && await deps.hit(`routes-notify-tenant:${tenantId}`, NOTIFY_PER_HOUR_PER_TENANT, HOUR_MS, now);
  } catch {
    console.error("Routes notify failed: step=limiter");
  }
  if (!allowed) return reply(429, { error: "too_many" });
  const appointmentId = await readAppointmentId(request);
  if (!appointmentId) return reply(400, { error: "invalid" });

  let verified: Verified;
  try {
    const stored = await deps.readOutcome(tenantId, appointmentId);
    if (stored !== null) return settled(toNotifyOutcome(stored));
    verified = await verify(deps, tenantId, appointmentId);
  } catch {
    console.error("Routes notify failed: step=verify");
    return refused("unavailable");
  }
  if ("refusal" in verified) return refused(verified.refusal);

  // From here on the job counts as handled: any result stays, and nothing retries.
  try {
    if (!await deps.claim({ tenantId, appointmentId, actorId: user.id })) {
      return settled(toNotifyOutcome((await deps.readOutcome(tenantId, appointmentId)) ?? "pending"));
    }
  } catch {
    console.error("Routes notify failed: step=claim");
    return refused("unavailable");
  }
  let outcome: NotifyOutcome = "unconfirmed";
  try {
    outcome = OUTCOMES[await deps.pulseTag(tenantId, verified.contactId, verified.hasTag)];
  } catch {
    console.error("Routes notify failed: step=tag");
  }
  try {
    await deps.finish(tenantId, appointmentId, outcome);
  } catch {
    console.error("Routes notify failed: step=finish"); // the stored row stays pending, which reads as unconfirmed
  }
  return settled(outcome);
}
