// Pure decision for the Vercel build's migration step (scripts/vercel-migrate.ts runs it).
// One writer: only a production build of `main` and a preview build of `staging` apply migrations.
// A preview build of `develop` only checks. Everything else touches no database.
// Never `migrate dev`, `db push`, `migrate reset` or `migrate resolve`. Messages never hold a URL.
// Why and the release order: docs/release-migrations.md.

export type MigrateEnv = {
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

// Both URLs set, the direct one really direct, and both for the same endpoint.
function urlProblem(env: MigrateEnv): string | null {
  const direct = env.DATABASE_URL_UNPOOLED;
  if (!direct) return "DATABASE_URL_UNPOOLED is not set for this environment";
  const directHost = hostOf(direct);
  if (!directHost) return "DATABASE_URL_UNPOOLED does not parse as a URL";
  if (POOLER.test(directHost)) return "DATABASE_URL_UNPOOLED points to a pooler host, not the direct one";
  if (!env.DATABASE_URL) return "DATABASE_URL is not set, so the target cannot be checked against the app's database";
  if (!sameNeonEndpoint(env.DATABASE_URL, direct)) return "DATABASE_URL and DATABASE_URL_UNPOOLED point to different Neon endpoints";
  return null;
}

export function decide(env: MigrateEnv): Decision {
  const vercelEnv = env.VERCEL_ENV ?? "";
  const ref = env.VERCEL_GIT_COMMIT_REF ?? "";
  const target = `env=${vercelEnv || "none"} ref=${ref || "none"}`;
  if (vercelEnv === "production" && ref !== "main") {
    return { action: "refuse", message: `Release migrations: refuse ${target}. A production build must come from main.` };
  }
  const applies = (vercelEnv === "production" && ref === "main") || (vercelEnv === "preview" && ref === "staging");
  if (applies) {
    const problem = urlProblem(env);
    if (problem) return { action: "refuse", message: `Release migrations: refuse ${target}. ${problem}. Nothing was applied.` };
    return { action: "deploy", command: ["migrate", "deploy"], target, message: `Release migrations: deploy ${target}` };
  }
  if (vercelEnv === "preview" && ref === "develop") {
    if (!env.DATABASE_URL_UNPOOLED) {
      return { action: "warn", message: `Release migrations: warning ${target}. DATABASE_URL_UNPOOLED is not set, so pending migrations were not checked. Build continues.` };
    }
    const problem = urlProblem(env);
    if (problem) return { action: "refuse", message: `Release migrations: refuse ${target}. ${problem}.` };
    return { action: "status", command: ["migrate", "status"], target, message: `Release migrations: status ${target} (check only, never applies)` };
  }
  return { action: "skip", message: `Release migrations: skip ${target}. No database touched.` };
}
