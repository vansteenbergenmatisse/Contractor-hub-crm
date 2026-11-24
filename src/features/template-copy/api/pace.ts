// Keeps one HighLevel location under its burst limit (100 requests per 10 seconds per app and
// location, marketplace FAQ). One request every 125 ms is 8 a second. After a 429 nothing is sent for
// a full burst window and the pace halves (down to one a second). HighLevel's 429 has no Retry-After
// (docs/greenlane/hl-api-notes.md), so the window is the wait.
export const PACE_MS = 125;
export const BACKOFF_MS = 10_000;
const SLOWEST_MS = 1_000;

export function createPacer(deps: { now: () => number; wait: (ms: number) => Promise<void>; intervalMs?: number }) {
  let interval = deps.intervalMs ?? PACE_MS;
  let next = 0;
  let limited = 0;
  return {
    async beforeRequest(): Promise<void> {
      const now = deps.now();
      const at = Math.max(now, next);
      next = at + interval;
      if (at > now) await deps.wait(at - now);
    },
    observeStatus(status: number): void {
      if (status !== 429) return;
      limited += 1;
      interval = Math.min(interval * 2, SLOWEST_MS);
      next = Math.max(next, deps.now() + BACKOFF_MS);
    },
    // How many 429 answers this pacer has seen.
    limitedCount: () => limited,
  };
}
