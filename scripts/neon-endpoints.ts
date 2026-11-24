// The Neon endpoint each environment's database must be on. Not secret: an endpoint id is the first
// label of the host name without `-pooler` (no user, password or database name). The Vercel build
// migrates only when the direct URL's endpoint equals the id for its environment, so a staging build
// whose URLs point at production refuses instead of migrating production.
// Change an id here only in the same reviewed change that moves that environment to a new endpoint.
export type NeonEnvironment = "production" | "staging" | "develop";

export const EXPECTED_NEON_ENDPOINTS: Readonly<Record<NeonEnvironment, string>> = {
  production: "ep-curly-credit-bb6w73hg",
  staging: "ep-broad-voice-bb2ds4xc",
  develop: "ep-proud-flower-bbnaierb",
};
