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
  // `keepOthers`: the list is partial, so alert rows outside it must not be forgotten.
  claimAlerts(companyId: string, missing: ReadonlyArray<{ locationId: string; name: string | null }>, now: Date, options?: { keepOthers: boolean }): Promise<Array<{ locationId: string; name: string | null }>>;
  releaseAlerts(locationIds: readonly string[]): Promise<void>;
  // Null address: alerts are skipped (and logged once per run).
  adminEmail: string | null;
  installLink: string;
  send(message: EmailMessage): Promise<{ delivered: boolean }>;
  // True when the admin may be mailed now about this agency's lost token. Left out: no mail.
  claimAgencyAlert?(companyId: string, now: Date): Promise<boolean>;
  // Gives the claim back when the mail did not leave (the delivery guard held it).
  releaseAgencyAlert?(companyId: string): Promise<void>;
  // When the whole request began, so work done before this sync counts against the time budget.
  startedAt?: Date;
  // Where to start in each list, so rows that keep running long cannot use up every run's budget.
  startOffset?: (length: number) => number;
};

// No new step starts after this, so one in flight can finish inside the 60-second function limit
// (a HighLevel call can take 10 seconds). A proposal, not a measured number.
const SYNC_TIME_BUDGET_MS = 35_000;

function rotated<T>(list: readonly T[], startOffset: SyncDeps["startOffset"]): T[] {
  const offset = list.length > 0 ? (startOffset?.(list.length) ?? 0) : 0;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

const cleanForMail = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120);

// `stillConnected`: sub-accounts the CRM treats as connected although HighLevel no longer lists the
// app. The list can lag, so nothing is switched off: the admin checks them.
export function buildAlertMessage(
  to: string,
  installLink: string,
  missing: ReadonlyArray<{ locationId: string; name: string | null }>,
  stillConnected: ReadonlySet<string> = new Set(),
): EmailMessage {
  const note = (id: string) => (stillConnected.has(id) ? " - still connected in the CRM, nothing was changed; check it in HighLevel" : "");
  const lines = missing.map((m) => `- ${cleanForMail(m.name ?? "(no name)")} (${cleanForMail(m.locationId)})${note(m.locationId)}`);
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

function buildAgencyTokenAlert(to: string, installLink: string, companyId: string): EmailMessage {
  return {
    kind: "admin_alert",
    to,
    subject: "A HighLevel agency connection needs a reinstall",
    text: [
      `The CRM can no longer use the HighLevel agency token of company ${cleanForMail(companyId)}.`,
      `New sub-accounts are not onboarded and the daily sync skips this agency until the app is installed again.`,
      ``,
      `Install it (sign in as a Forge Forward admin first): ${installLink}`,
      ``,
      `You get this mail at most once a day per agency.`,
    ].join("\n"),
  };
}

// One pass over every agency we hold a token for. Idempotent: safe to run at any time.
//  1. Sub-accounts of the agency WITHOUT the app, and connected tenants its complete list no longer
//     names: one batched mail to the admin, at most once per day each. Nothing is switched off.
//  2. Sub-accounts HighLevel says have the app but we do not know: onboard them (token, tenant, users).
//  3. Sub-accounts we know: re-read their users (new people get accounts, removed people are blocked).
// A failure in one location or agency is counted and logged by step, and the run goes on. After the
// time budget no new step starts; a rotating start gives every tenant its turn across runs.
export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const summary: SyncSummary = { companies: 0, installedLocations: 0, onboarded: 0, usersCreated: 0, missingApp: 0, alertsSent: 0, failures: 0 };
  let users: UserCounts = emptyUserCounts();
  const started = (deps.startedAt ?? deps.now()).getTime();
  const outOfTime = () => deps.now().getTime() - started > SYNC_TIME_BUDGET_MS;
  let skipped = 0;
  let listSkipped = false;
  // Every agency's list is read first, so a location listed by two agencies is known before anything
  // is onboarded.
  const reads: Array<{ companyId: string; agency: NonNullable<Awaited<ReturnType<SyncDeps["agency"]>>>; installed: InstalledLocation[] }> = [];
  const agenciesListing = new Map<string, number>();
  for (const companyId of rotated(await deps.companyIds(), deps.startOffset)) {
    summary.companies += 1;
    if (outOfTime()) {
      skipped += 1;
      listSkipped = true;
      continue;
    }
    let agency;
    try {
      agency = await deps.agency(companyId);
    } catch (error) {
      summary.failures += 1;
      console.error(`Sync: agency token step failed: ${error instanceof Error ? error.name : "unknown error"}`);
      continue;
    }
    if (!agency) {
      console.error("Sync: agency_token_unusable, the agency must install the app again");
      await alertLostAgency(deps, companyId, summary);
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

  const plans: Array<(typeof reads)[number] & { known: Map<string, string> }> = [];
  for (const read of reads) {
    plans.push({ ...read, known: new Map((await deps.connectedTenants(read.companyId)).map((t) => [t.locationId, t.tenantId])) });
  }

  // Alerts go before the per-tenant work, so a long tenant pass can never starve them.
  for (const plan of rotated(plans, deps.startOffset)) {
    if (outOfTime()) {
      skipped += 1;
      continue;
    }
    await alertMissing(deps, plan, summary);
  }

  const skippedShared = new Set<string>();
  const jobs = plans.flatMap(({ companyId, known, installed }) => installed.map((location) => ({ companyId, known, location })));
  for (const { companyId, known, location } of rotated(jobs, deps.startOffset)) {
    const tenantId = known.get(location.locationId);
    if (!tenantId && (agenciesListing.get(location.locationId) ?? 0) > 1) {
      // Never attach it to whichever agency came first.
      skippedShared.add(location.locationId);
      continue;
    }
    // A skipped agency's list is unknown, so a new location could be one it also lists.
    if (outOfTime() || (!tenantId && listSkipped)) {
      skipped += 1;
      continue;
    }
    try {
      if (tenantId) {
        users = addCounts(users, await deps.resyncUsers(tenantId));
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
  if (skippedShared.size > 0) {
    summary.failures += skippedShared.size;
    console.warn(`Sync: location_listed_by_multiple_agencies count=${skippedShared.size}`);
  }
  summary.usersCreated = users.created;
  console.info(`Sync: companies=${summary.companies} installed=${summary.installedLocations} onboarded=${summary.onboarded} usersCreated=${users.created} usersLinked=${users.linked} usersMoved=${users.moved} usersDeactivated=${users.deactivated} userFailures=${users.failed} conflicts=${users.skippedConflict} capped=${users.capped} suspicious=${users.suspicious} missingApp=${summary.missingApp} alertsSent=${summary.alertsSent} failures=${summary.failures} skipped=${skipped}`);
  return summary;
}

async function alertLostAgency(deps: SyncDeps, companyId: string, summary: SyncSummary): Promise<void> {
  if (!deps.claimAgencyAlert) return;
  if (!deps.adminEmail) {
    console.warn("Sync: ADMIN_ALERT_EMAIL is not set, so the agency token alert is skipped");
    return;
  }
  try {
    if (!(await deps.claimAgencyAlert(companyId, deps.now()))) return;
    const { delivered } = await deps.send(buildAgencyTokenAlert(deps.adminEmail, deps.installLink, companyId));
    if (!delivered) {
      console.warn("Sync: agency_alert_not_delivered, check the email delivery settings");
      await deps.releaseAgencyAlert?.(companyId);
      return;
    }
    summary.alertsSent += 1;
  } catch (error) {
    summary.failures += 1;
    console.error(`Sync: agency token alert failed: ${error instanceof Error ? error.name : "unknown error"}`);
  }
}

// Sub-accounts without the app, plus connected tenants a complete installed list no longer names.
// The second group is only reported: the list can lag, and marking one uninstalled could cut off a
// real client.
async function alertMissing(
  deps: SyncDeps,
  plan: { companyId: string; agency: { locations(): Promise<AgencyLocation[]> }; installed: InstalledLocation[]; known: Map<string, string> },
  summary: SyncSummary,
): Promise<void> {
  const { companyId, agency, installed, known } = plan;
  const installedIds = new Set(installed.map((l) => l.locationId));
  const unlisted = [...known.keys()].filter((id) => !installedIds.has(id));
  if (unlisted.length > 0) console.warn(`Sync: connected_tenant_not_listed count=${unlisted.length}`);
  let locations: AgencyLocation[] | null = null;
  try {
    locations = await agency.locations();
  } catch (error) {
    summary.failures += 1;
    console.error(`Sync: missing-app step failed: ${error instanceof Error ? error.name : "unknown error"}`);
    if (unlisted.length === 0) return;
  }
  try {
    const notInstalled = (locations ?? []).filter((l) => !installedIds.has(l.locationId)).map((l) => ({ locationId: l.locationId, name: l.name }));
    summary.missingApp += notInstalled.length;
    const namedIds = new Set(notInstalled.map((l) => l.locationId));
    const missing = [...notInstalled, ...unlisted.filter((id) => !namedIds.has(id)).map((locationId) => ({ locationId, name: null }))];
    const due = locations
      ? await deps.claimAlerts(companyId, missing, deps.now())
      : await deps.claimAlerts(companyId, missing, deps.now(), { keepOthers: true });
    if (due.length === 0) return;
    if (!deps.adminEmail) {
      console.warn("Sync: ADMIN_ALERT_EMAIL is not set, so the missing-app alert is skipped");
      await deps.releaseAlerts(due.map((d) => d.locationId));
      return;
    }
    let delivered: boolean;
    try {
      ({ delivered } = await deps.send(buildAlertMessage(deps.adminEmail, deps.installLink, due, new Set(unlisted))));
    } catch (error) {
      await deps.releaseAlerts(due.map((d) => d.locationId));
      throw error;
    }
    if (!delivered) {
      console.warn("Sync: missing_app_alert_not_delivered, check the email delivery settings");
      await deps.releaseAlerts(due.map((d) => d.locationId));
      return;
    }
    summary.alertsSent += 1;
  } catch (error) {
    summary.failures += 1;
    console.error(`Sync: missing-app step failed: ${error instanceof Error ? error.name : "unknown error"}`);
  }
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
