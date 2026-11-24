import { runSync, throttledCompanyIds, type SyncDeps } from "./sync";
import { errorLabel } from "./visit-sync";
import { emptyUserCounts, type SyncSummary, type UserCounts } from "../types";

// The on-demand reconcile that stands in for the production-only cron on dev and staging: the
// background run when an admin opens /admin/clients, and the "Check for new sub-accounts" button.
// Pure wiring over injected pieces, so the throttles and options are tested by behavior.

// A proposal, not a measured number: often enough that a new client appears within minutes of an
// admin looking, rare enough that page loads do not multiply HighLevel calls. Per agency for the
// background run, and per tenant for its re-read of known users.
export const ADMIN_RECONCILE_INTERVAL_MS = 5 * 60_000;
// The button, per agency. Shorter than the background window on purpose: the page's own background
// run has just claimed that one, so reusing it would make every click right after opening the page a
// no-op. A proposal, not a measured number.
export const MANUAL_CHECK_AGENCY_INTERVAL_MS = 60_000;

export type ReconcileSources = Pick<SyncDeps, "companyIds" | "agency" | "connectedTenants" | "claimAlerts" | "releaseAlerts"> & {
  // `listedAt`: when this run began (before any installed list was read), so a location uninstalled
  // after that moment is not revived.
  onboard(input: { companyId: string; locationId: string; name: string | null; listedAt: Date }): ReturnType<SyncDeps["onboard"]>;
  resyncUsers(tenantId: string): Promise<UserCounts>;
};

export type ReconcileDeps = {
  now(): Date;
  // A shared rate limit (hitRateLimit): true while `key` is within `limit` calls in the window.
  hit(key: string, limit: number, windowMs: number, now: Date): Promise<boolean>;
  // Built per run (the real one reads env and may throw: the caller treats that as a failed run).
  sources(): ReconcileSources;
  startOffset?: (length: number) => number;
};

export type CheckSummary = SyncSummary & {
  // Agencies the button skipped because one was checked less than a minute ago.
  throttled: number;
};

// No admin mails, no read of the agency's full sub-account list: the daily cron sends those.
function reconcileSyncDeps(deps: ReconcileDeps, sources: ReconcileSources, startedAt: Date, resyncKnown: boolean): SyncDeps {
  return {
    now: deps.now,
    companyIds: sources.companyIds,
    agency: sources.agency,
    connectedTenants: sources.connectedTenants,
    onboard: (input) => sources.onboard({ ...input, listedAt: startedAt }),
    resyncUsers: sources.resyncUsers,
    claimAlerts: sources.claimAlerts,
    releaseAlerts: sources.releaseAlerts,
    adminEmail: null,
    installLink: "",
    send: async () => ({ delivered: false }),
    alerts: false,
    resyncKnown,
    startedAt,
    startOffset: deps.startOffset ?? ((length) => Math.floor(Math.random() * length)),
  };
}

export function createReconcile(deps: ReconcileDeps) {
  // A claim that fails counts as "not due", so a database hiccup never fans out.
  async function claim(key: string, windowMs: number): Promise<boolean> {
    try {
      return await deps.hit(key, 1, windowMs, deps.now());
    } catch (error) {
      console.error(`Reconcile: claim failed: ${errorLabel(error)}`);
      return false;
    }
  }

  // Background, after an admin opens /admin/clients. Each agency at most once per 5 minutes; each
  // known tenant's users at most once per 5 minutes, whatever path asked.
  async function onVisit(): Promise<SyncSummary> {
    const startedAt = deps.now();
    const sources = deps.sources();
    const base = reconcileSyncDeps(deps, sources, startedAt, true);
    return runSync({
      ...base,
      companyIds: throttledCompanyIds(base.companyIds, (companyId) => deps.hit(`agency-reconcile:${companyId}`, 1, ADMIN_RECONCILE_INTERVAL_MS, deps.now())),
      resyncUsers: async (tenantId) =>
        (await claim(`tenant-user-resync:${tenantId}`, ADMIN_RECONCILE_INTERVAL_MS)) ? sources.resyncUsers(tenantId) : emptyUserCounts(),
    });
  }

  // The button: new sub-accounts only (known tenants keep their users), each agency at most once a
  // minute. The answer says how many agencies were skipped, so the admin is told.
  async function onCheck(): Promise<CheckSummary> {
    const startedAt = deps.now();
    const base = reconcileSyncDeps(deps, deps.sources(), startedAt, false);
    let throttled = 0;
    const summary = await runSync({
      ...base,
      companyIds: throttledCompanyIds(base.companyIds, async (companyId) => {
        const due = await deps.hit(`agency-reconcile:manual-agency:${companyId}`, 1, MANUAL_CHECK_AGENCY_INTERVAL_MS, deps.now());
        if (!due) throttled += 1;
        return due;
      }),
    });
    return { ...summary, throttled };
  }

  return { onVisit, onCheck };
}
