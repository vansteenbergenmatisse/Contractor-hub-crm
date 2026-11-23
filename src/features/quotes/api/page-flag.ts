type FlagEnv = Record<string, string | undefined>;

// Off unless the server flag QUOTES_PAGE_LIVE is exactly "true".
export function isQuotesPageLive(env: FlagEnv = process.env): boolean {
  return env.QUOTES_PAGE_LIVE === "true";
}
