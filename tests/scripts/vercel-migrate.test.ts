import { describe, expect, it } from "vitest";
import { decide, sameNeonEndpoint } from "../../scripts/vercel-migrate-decide";

// The Vercel build's migration step. Fake hosts and passwords only.
const POOLED = "postgresql://user:secret-pass@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const DIRECT = "postgresql://user:secret-pass@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const OTHER_DIRECT = "postgresql://user:secret-pass@ep-other-name-999999.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const urls = { DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT };

describe("decide: what the Vercel build does with the database", () => {
  it.each([
    ["production build of main", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", ...urls }, "deploy"],
    ["preview build of staging", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging", ...urls }, "deploy"],
    ["preview build of develop with the direct URL", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", ...urls }, "status"],
    ["preview build of develop without the direct URL", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", DATABASE_URL: POOLED }, "warn"],
    ["preview build of a feature branch", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/x-y", ...urls }, "skip"],
    ["local build", { ...urls }, "skip"],
    ["development env", { VERCEL_ENV: "development", VERCEL_GIT_COMMIT_REF: "main", ...urls }, "skip"],
    ["production env from another branch", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "staging", ...urls }, "refuse"],
    ["production of main without the direct URL", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL: POOLED }, "refuse"],
    ["staging without the direct URL", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging", DATABASE_URL: POOLED }, "refuse"],
    ["main without the pooled URL", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL_UNPOOLED: DIRECT }, "refuse"],
    ["main with URLs for two endpoints", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: OTHER_DIRECT }, "refuse"],
    ["staging with the pooled URL as the direct one", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging", DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: POOLED }, "refuse"],
    ["develop with URLs for two endpoints", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: OTHER_DIRECT }, "refuse"],
    ["main with a direct URL that does not parse", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: "not a url" }, "refuse"],
  ] as const)("%s -> %s", (_name, env, action) => {
    expect(decide(env).action).toBe(action);
  });

  it("deploy and status run only migrate deploy or migrate status, never anything that resets or pushes", () => {
    const envs = [
      { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", ...urls },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging", ...urls },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", ...urls },
    ];
    const commands = envs.map((env) => decide(env)).map((d) => ("command" in d ? d.command.join(" ") : ""));
    expect(commands).toEqual(["migrate deploy", "migrate deploy", "migrate status"]);
    for (const command of commands) expect(command).not.toMatch(/dev|push|reset|resolve/);
  });

  it("never puts a URL, user or password in its message", () => {
    const envs = [
      { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", ...urls },
      { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: OTHER_DIRECT },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", DATABASE_URL: POOLED },
    ];
    for (const env of envs) {
      const { message } = decide(env);
      expect(message).not.toMatch(/secret-pass|user:|postgresql:|neon\.tech/);
    }
  });
});

describe("sameNeonEndpoint", () => {
  it("treats the pooled and direct host of one endpoint as the same", () => {
    expect(sameNeonEndpoint(POOLED, DIRECT)).toBe(true);
  });
  it("tells two endpoints apart", () => {
    expect(sameNeonEndpoint(POOLED, OTHER_DIRECT)).toBe(false);
  });
  it("answers false for a URL that does not parse", () => {
    expect(sameNeonEndpoint("::", DIRECT)).toBe(false);
  });
});
