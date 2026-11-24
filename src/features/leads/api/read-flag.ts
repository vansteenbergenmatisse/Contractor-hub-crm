type FlagEnv = Record<string, string | undefined>;

// The server kill switch for reading leads. It covers the Leads page and the CSV export.
export function isLeadsReadDisabled(env: FlagEnv = process.env): boolean {
  return env.LEADS_READ_DISABLED?.trim() === "true";
}
