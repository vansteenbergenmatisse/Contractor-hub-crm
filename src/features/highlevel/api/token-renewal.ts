// Renews HighLevel tokens before they expire, so a client's connection stays usable even when nobody
// has opened the app. Each token goes through the token service and its row lock. One failure never
// stops the rest. Logs hold counts only: no ids, tokens or customer data.
export const CRON_RENEWAL_WINDOW_MS = 26 * 60 * 60 * 1000; // a daily job must cover a full day
export const VISIT_RENEWAL_WINDOW_MS = 6 * 60 * 60 * 1000;
export const VISIT_RENEWAL_INTERVAL_MS = 10 * 60 * 1000;
const TIME_BUDGET_MS = 25_000;
const MAX_AGENCIES = 20;
const MAX_LOCATIONS = 200;

export type TokenRenewalSummary = { due: number; renewed: number; unchanged: number; failed: number; skipped: number };

export type TokenRenewalDeps = {
  now: () => Date;
  listDueAgencies: (before: Date, limit: number) => Promise<string[]>;
  listDueLocations: (before: Date, limit: number) => Promise<string[]>;
  // True when a new token was stored, false when nothing needed doing.
  renewAgency: (companyId: string, minLifeMs: number) => Promise<boolean>;
  renewLocation: (tenantId: string, minLifeMs: number) => Promise<boolean>;
};

export async function renewDueTokens(deps: TokenRenewalDeps, windowMs: number): Promise<TokenRenewalSummary> {
  const summary: TokenRenewalSummary = { due: 0, renewed: 0, unchanged: 0, failed: 0, skipped: 0 };
  const started = deps.now();
  const before = new Date(started.getTime() + windowMs);
  let jobs: Array<() => Promise<boolean>>;
  try {
    // Agencies first: a location whose refresh token was refused is re-minted with the agency token.
    const agencies = await deps.listDueAgencies(before, MAX_AGENCIES);
    const locations = await deps.listDueLocations(before, MAX_LOCATIONS);
    jobs = [
      ...agencies.map((id) => () => deps.renewAgency(id, windowMs)),
      ...locations.map((id) => () => deps.renewLocation(id, windowMs)),
    ];
  } catch (error) {
    summary.failed = 1;
    console.error(`Token renewal: list step failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return summary;
  }
  summary.due = jobs.length;
  for (const job of jobs) {
    if (deps.now().getTime() - started.getTime() > TIME_BUDGET_MS) {
      summary.skipped += 1;
      continue;
    }
    try {
      if (await job()) summary.renewed += 1;
      else summary.unchanged += 1;
    } catch (error) {
      summary.failed += 1;
      const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
      console.error(`Token renewal: item failed: code=${code}`);
    }
  }
  console.info(`Token renewal: due=${summary.due} renewed=${summary.renewed} unchanged=${summary.unchanged} failed=${summary.failed} skipped=${summary.skipped}`);
  return summary;
}
