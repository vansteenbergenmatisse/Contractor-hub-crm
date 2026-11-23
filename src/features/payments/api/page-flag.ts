type FlagEnv = Record<string, string | undefined>;

// Off unless the server flag PAYMENTS_PAGE_LIVE is exactly "true".
export function isPaymentsPageLive(env: FlagEnv = process.env): boolean {
  return env.PAYMENTS_PAGE_LIVE === "true";
}
