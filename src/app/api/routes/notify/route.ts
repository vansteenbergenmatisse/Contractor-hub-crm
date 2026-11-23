import { getGuards, hitRateLimit } from "@/features/auth";
import { createTenantCalendarReader, createTenantContactTagAdapter } from "@/features/highlevel";
import {
  claimStartNotification,
  finishStartNotification,
  handleNotifyStart,
  isRoutesNotifyEnabled,
  notifyFailure,
  readStartOutcome,
} from "@/features/routes";
import { parseEnv } from "@/shared/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Start on the next job: adds the tag a HighLevel workflow listens for. Off by default.
export async function POST(request: Request): Promise<Response> {
  try {
    const env = parseEnv("auth");
    let adapter: ReturnType<typeof createTenantContactTagAdapter> | null = null;
    const tags = () => (adapter ??= createTenantContactTagAdapter());
    return await handleNotifyStart(request, {
      appOrigin: new URL(env.APP_URL).origin,
      currentUser: (req) => getGuards().currentUser(req),
      isEnabled: (tenantId) => isRoutesNotifyEnabled(tenantId),
      hit: hitRateLimit,
      read: createTenantCalendarReader(hitRateLimit),
      now: () => new Date(),
      readAppointmentContact: (tenantId, query) => tags().readAppointmentContact(tenantId, query),
      readContactTagState: (tenantId, contactId) => tags().readContactTagState(tenantId, contactId),
      pulseTag: (tenantId, contactId, hasTag) => tags().pulseTag(tenantId, contactId, hasTag),
      readOutcome: readStartOutcome,
      claim: claimStartNotification,
      finish: finishStartNotification,
    });
  } catch {
    return notifyFailure();
  }
}
