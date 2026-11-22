// Which pages other sites may put in an iframe (build prompt 4.5). After sign-in the whole app runs
// inside HighLevel's iframe, so every page allows HighLevel except the ones below, which carry
// passwords, invites or admin power and must never be framed (clickjacking).
// The HighLevel hosts are the ones the build prompt names; HighLevel's docs name no parent origins and
// the agency's white-label domain is not known yet (PROGRESS.md, open question).
export const HIGHLEVEL_FRAME_ANCESTORS = ["https://app.gohighlevel.com", "https://app.leadconnectorhq.com"];
export const FRAME_DENIED_PATHS = ["sign-in", "forgot-password", "reset-password", "invite", "admin", "api"];

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

export function frameHeaders(): HeaderRule[] {
  const denied = FRAME_DENIED_PATHS.join("|");
  return [
    {
      source: `/((?!(?:${denied})(?:/|$)).*)`,
      headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${HIGHLEVEL_FRAME_ANCESTORS.join(" ")}` }],
    },
    ...[`/:area(${denied})/:rest*`].map((source) => ({
      source,
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    })),
  ];
}
