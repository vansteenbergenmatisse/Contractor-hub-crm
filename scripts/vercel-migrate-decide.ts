// Pure decision for the Vercel build's migration step (scripts/vercel-migrate.ts runs it).
// One writer: only a production build of `main` and a preview build of `staging` apply migrations.
// A preview build of `develop` only checks. Everything else touches no database.
// The direct URL must be on the Neon endpoint pinned for that environment (scripts/neon-endpoints.ts).
// Never `migrate dev`, `db push`, `migrate reset` or `migrate resolve`. Messages never hold a URL;
// they may name an endpoint id, which is not secret.
// Why and the release order: docs/release-migrations.md.
import { EXPECTED_NEON_ENDPOINTS, type NeonEnvironment } from "./neon-endpoints";

export type MigrateEnv = {
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
};

export type Decision =
  | { action: "deploy"; command: ["migrate", "deploy"]; target: string; message: string }
  | { action: "status"; command: ["migrate", "status"]; target: string; message: string }
  | { action: "warn"; message: string }
  | { action: "skip"; message: string }
  | { action: "refuse"; message: string };

const POOLER = /-pooler(?=\.|$)/;

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

// One Neon endpoint has a pooled host (`ep-x-pooler.region...`) and a direct one (`ep-x.region...`).
export function sameNeonEndpoint(pooledUrl: string, directUrl: string): boolean {
  const pooled = hostOf(pooledUrl);
  const direct = hostOf(directUrl);
  if (!pooled || !direct) return false;
  return pooled.replace(POOLER, "") === direct;
}

// `ep-x-123` from either host of that endpoint. Null when the URL does not parse.
export function neonEndpointId(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  return host.split(".")[0].replace(/-pooler$/, "") || null;
}

// Both URLs set and parsable, the direct one really direct, both on the same endpoint, and that
// endpoint the one pinned for this environment. Both URLs may name the direct host: still one endpoint.
function urlProblem(env: MigrateEnv, environment: NeonEnvironment, expected: Readonly<Record<NeonEnvironment, string>>): string | null {
  const direct = env.DATABASE_URL_UNPOOLED;
  if (!direct) return "DATABASE_URL_UNPOOLED is not set for this environment";
  const directHost = hostOf(direct);
  if (!directHost) return "DATABASE_URL_UNPOOLED does not parse as a URL";
  if (POOLER.test(directHost)) return "DATABASE_URL_UNPOOLED points to a pooler host, not the direct one";
  if (!env.DATABASE_URL) return "DATABASE_URL is not set, so the target cannot be checked against the app's database";
  if (!hostOf(env.DATABASE_URL)) return "DATABASE_URL does not parse as a URL";
  if (!sameNeonEndpoint(env.DATABASE_URL, direct)) return "DATABASE_URL and DATABASE_URL_UNPOOLED point to different Neon endpoints";
  const actual = neonEndpointId(direct);
  const wanted = expected[environment];
  if (actual !== wanted) return `the database is on Neon endpoint ${actual ?? "unknown"}, but ${environment} must be on ${wanted} (scripts/neon-endpoints.ts)`;
  return null;
}

// Vercel sets VERCEL=1 in its builds. Without VERCEL_ENV or the ref there ("Automatically expose
// System Environment Variables" off) the step cannot tell where it runs, so it must not quietly skip.
const isVercelBuild = (env: MigrateEnv) => (env.VERCEL ?? "") !== "" && env.VERCEL !== "0";

export function decide(env: MigrateEnv, expected: Readonly<Record<NeonEnvironment, string>> = EXPECTED_NEON_ENDPOINTS): Decision {
  const vercelEnv = env.VERCEL_ENV ?? "";
  const ref = env.VERCEL_GIT_COMMIT_REF ?? "";
  const target = `env=${vercelEnv || "none"} ref=${ref || "none"}`;
  if (isVercelBuild(env) && (!vercelEnv || !ref) && env.DATABASE_URL_UNPOOLED) {
    return { action: "refuse", message: `Release migrations: refuse ${target}. This is a Vercel build but VERCEL_ENV or VERCEL_GIT_COMMIT_REF is missing, so it cannot tell which database to migrate. Turn on "Automatically expose System Environment Variables". Nothing was applied.` };
  }
  if (vercelEnv === "production" && ref !== "main") {
    return { action: "refuse", message: `Release migrations: refuse ${target}. A production build must come from main.` };
  }
  const environment: NeonEnvironment | null =
    vercelEnv === "production" && ref === "main" ? "production" : vercelEnv === "preview" && ref === "staging" ? "staging" : null;
  if (environment) {
    const problem = urlProblem(env, environment, expected);
    if (problem) return { action: "refuse", message: `Release migrations: refuse ${target}. ${problem}. Nothing was applied.` };
    return { action: "deploy", command: ["migrate", "deploy"], target, message: `Release migrations: deploy ${target}` };
  }
  if (vercelEnv === "preview" && ref === "develop") {
    if (!env.DATABASE_URL_UNPOOLED) {
      return { action: "warn", message: `Release migrations: warning ${target}. DATABASE_URL_UNPOOLED is not set, so pending migrations were not checked. Build continues.` };
    }
    const problem = urlProblem(env, "develop", expected);
    if (problem) return { action: "refuse", message: `Release migrations: refuse ${target}. ${problem}.` };
    return { action: "status", command: ["migrate", "status"], target, message: `Release migrations: status ${target} (check only, never applies)` };
  }
  return { action: "skip", message: `Release migrations: skip ${target}. No database touched.` };
}
