type FlagEnv = Record<string, string | undefined>;

// Off unless the server flag INVOICES_PAGE_LIVE is exactly "true".
export function isInvoicesPageLive(env: FlagEnv = process.env): boolean {
  return env.INVOICES_PAGE_LIVE === "true";
}
