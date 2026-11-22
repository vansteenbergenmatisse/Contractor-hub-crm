import { timingSafeEqual } from "node:crypto";
import type { AgencyLocation, InstalledLocation } from "@/features/highlevel";
import type { EmailMessage } from "@/features/auth";
import { onboardLocation } from "./onboard";
import { addCounts } from "./users";
import { emptyUserCounts, type SyncSummary, type UserCounts } from "../types";

export type SyncDeps = {
  now(): Date;
  companyIds(): Promise<string[]>;
  // Null when the agency has no usable token (its INSTALL/UNINSTALL state is then unknown).
  agency(companyId: string): Promise<{ installed(): Promise<InstalledLocation[]>; locations(): Promise<AgencyLocation[]> } | null>;
  connectedTenants(companyId: string): Promise<Array<{ tenantId: string; locationId: string }>>;
  onboard(input: { companyId: string; locationId: string; name: string | null }): ReturnType<typeof onboardLocation>;
  // Re-read and sync the users of a tenant that is already onboarded.
  resyncUsers(tenantId: string): Promise<UserCounts>;
  claimAlerts(companyId: string, missing: ReadonlyArray<{ locationId: string; name: string | null }>, now: Date): Promise<Array<{ locationId: string; name: string | null }>>;
  releaseAlerts(locationIds: readonly string[]): Promise<void>;
  // Null address: alerts are skipped (and logged once per run).
  adminEmail: string | null;
  installLink: string;
  send(message: EmailMessage): Promise<{ delivered: boolean }>;
};

export function buildAlertMessage(to: string, installLink: string, missing: ReadonlyArray<{ locationId: string; name: string | null }>): EmailMessage {
  const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120);
  const lines = missing.map((m) => `- ${clean(m.name ?? "(no name)")} (${clean(m.locationId)})`);
  return {
    kind: "admin_alert",
    to,
    subject: `${missing.length} sub-account${missing.length === 1 ? "" : "s"} without the CRM app`,
    text: [
      `These sub-accounts do not have the CRM app installed:`,
      ...lines,
      ``,
      `Install it (sign in as a Forge Forward admin first): ${installLink}`,
      ``,
      `You get this mail at most once a day per sub-account.`,
    ].join("\n"),
  };
}

// One pass over every agency we hold a token for. Idempotent: safe to run at any time.
//  1. Sub-accounts HighLevel says have the app but we do not know: onboard them (token, tenant, users).
//  2. Sub-accounts we know: re-read their users (new people get accounts, removed people are blocked).
//  3. Sub-accounts of the agency WITHOUT the app: one batched mail to the admin, at most once per day each.
// A failure in one location or agency is counted and logged by step, and the run goes on.
export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const summary: SyncSummary = { companies: 0, installedLocations: 0, onboarded: 0, usersCreated: 0, missingApp: 0, alertsSent: 0, failures: 0 };
  let users: UserCounts = emptyUserCounts();
  // Every agency's list is read first, so a location listed by two agencies is known before anything
  // is onboarded.
  const reads: Array<{ companyId: string; agency: NonNullable<Awaited<ReturnType<SyncDeps["agency"]>>>; installed: InstalledLocation[] }> = [];
  const agenciesListing = new Map<string, number>();
  for (const companyId of await deps.companyIds()) {
    summary.companies += 1;
    let agency;
    try {
      agency = await deps.agency(companyId);
    } catch (error) {
      summary.failures += 1;
      console.error(`Sync: agency token step failed: ${error instanceof Error ? error.name : "unknown error"}`);
      continue;
    }
    if (!agency) {
      console.info("Sync: an agency has no usable token, skipped");
      continue;
    }
    let installed: InstalledLocation[];
    try {
      installed = await agency.installed();
    } catch (error) {
      summary.failures += 1;
      console.error(`Sync: installed locations step failed: ${error instanceof Error ? error.name : "unknown error"}`);
      continue;
    }
    summary.installedLocations += installed.length;
    for (const locationId of new Set(installed.map((l) => l.locationId))) {
      agenciesListing.set(locationId, (agenciesListing.get(locationId) ?? 0) + 1);
    }
    reads.push({ companyId, agency, installed });
  }

  const skippedShared = new Set<string>();
  for (const { companyId, agency, installed } of reads) {
    const known = new Map((await deps.connectedTenants(companyId)).map((t) => [t.locationId, t.tenantId]));
    for (const location of installed) {
      try {
        const tenantId = known.get(location.locationId);
        if (tenantId) {
          users = addCounts(users, await deps.resyncUsers(tenantId));
        } else if ((agenciesListing.get(location.locationId) ?? 0) > 1) {
          // Never attach it to whichever agency came first.
          skippedShared.add(location.locationId);
        } else {
          const result = await deps.onboard({ companyId, locationId: location.locationId, name: location.name });
          summary.onboarded += 1;
          users = addCounts(users, result.users);
        }
      } catch (error) {
        summary.failures += 1;
        console.error(`Sync: onboarding step failed: ${error instanceof Error ? error.name : "unknown error"}`);
      }
    }
    try {
      const installedIds = new Set(installed.map((l) => l.locationId));
      const missing = (await agency.locations()).filter((l) => !installedIds.has(l.locationId)).map((l) => ({ locationId: l.locationId, name: l.name }));
      summary.missingApp += missing.length;
      const due = await deps.claimAlerts(companyId, missing, deps.now());
      if (due.length > 0) {
        if (!deps.adminEmail) {
          console.warn("Sync: ADMIN_ALERT_EMAIL is not set, so the missing-app alert is skipped");
          await deps.releaseAlerts(due.map((d) => d.locationId));
        } else {
          try {
            await deps.send(buildAlertMessage(deps.adminEmail, deps.installLink, due));
            summary.alertsSent += 1;
          } catch (error) {
            await deps.releaseAlerts(due.map((d) => d.locationId));
            throw error;
          }
        }
      }
    } catch (error) {
      summary.failures += 1;
      console.error(`Sync: missing-app step failed: ${error instanceof Error ? error.name : "unknown error"}`);
    }
  }
  if (skippedShared.size > 0) {
    summary.failures += skippedShared.size;
    console.warn(`Sync: location_listed_by_multiple_agencies count=${skippedShared.size}`);
  }
  summary.usersCreated = users.created;
  console.info(`Sync: companies=${summary.companies} installed=${summary.installedLocations} onboarded=${summary.onboarded} usersCreated=${users.created} usersLinked=${users.linked} usersMoved=${users.moved} usersDeactivated=${users.deactivated} userFailures=${users.failed} conflicts=${users.skippedConflict} capped=${users.capped} suspicious=${users.suspicious} missingApp=${summary.missingApp} alertsSent=${summary.alertsSent} failures=${summary.failures}`);
  return summary;
}

function bearerMatches(header: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  if (!match) return false;
  const a = Buffer.from(match[1]);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// GET (Vercel cron) or POST /api/integrations/sync with `Authorization: Bearer <CRON_SECRET>`.
// Fails closed: no secret configured answers 500, a wrong or missing header answers 401. The answer
// holds only counts.
export async function handleSync(request: Request, deps: { cronSecret: string | undefined; run: () => Promise<SyncSummary> }): Promise<Response> {
  const noStore = { "cache-control": "no-store" };
  if (!deps.cronSecret) return new Response("Server is not configured.", { status: 500, headers: noStore });
  if (!bearerMatches(request.headers.get("authorization"), deps.cronSecret)) return new Response(null, { status: 401, headers: noStore });
  try {
    return Response.json(await deps.run(), { headers: noStore });
  } catch (error) {
    console.error(`Sync failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return new Response(null, { status: 500, headers: noStore });
  }
}
