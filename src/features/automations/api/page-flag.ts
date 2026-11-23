type FlagEnv = Record<string, string | undefined>;

// Off unless the server flag AUTOMATIONS_PAGE_LIVE is exactly "true".
export function isAutomationsPageLive(env: FlagEnv = process.env): boolean {
  return env.AUTOMATIONS_PAGE_LIVE === "true";
}
