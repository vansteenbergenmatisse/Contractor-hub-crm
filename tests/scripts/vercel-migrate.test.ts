import { describe, expect, it, vi } from "vitest";
import { decide, neonEndpointId, sameNeonEndpoint, type MigrateEnv } from "../../scripts/vercel-migrate-decide";
import { runMigrate, type RunDeps } from "../../scripts/vercel-migrate-run";
import { EXPECTED_NEON_ENDPOINTS } from "../../scripts/neon-endpoints";

// The Vercel build's migration step. Fake hosts and passwords only.
const POOLED = "postgresql://user:secret-pass@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const DIRECT = "postgresql://user:secret-pass@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const OTHER_DIRECT = "postgresql://user:secret-pass@ep-other-name-999999.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const urls = { DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT };
// Every environment pinned to the fake endpoint, so these cases test the branch rules only.
const FAKE = { production: "ep-cool-name-123456", staging: "ep-cool-name-123456", develop: "ep-cool-name-123456" };

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
    expect(decide(env, FAKE).action).toBe(action);
  });

  it("deploy and status run only migrate deploy or migrate status, never anything that resets or pushes", () => {
    const envs = [
      { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", ...urls },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging", ...urls },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", ...urls },
    ];
    const commands = envs.map((env) => decide(env, FAKE)).map((d) => ("command" in d ? d.command.join(" ") : ""));
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
      const { message } = decide(env, FAKE);
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

describe("decide: review cases", () => {
  it.each([
    ["the direct host in both URLs (still one endpoint)", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL: DIRECT, DATABASE_URL_UNPOOLED: DIRECT }, "deploy"],
    ["ref ' main' for production", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: " main", ...urls }, "refuse"],
    ["ref 'Main' for production", { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "Main", ...urls }, "refuse"],
    ["a Vercel build without VERCEL_ENV, ref main", { VERCEL: "1", VERCEL_GIT_COMMIT_REF: "main", ...urls }, "refuse"],
    ["a Vercel build without the ref", { VERCEL: "1", VERCEL_ENV: "production", ...urls }, "refuse"],
    ["no Vercel marker, no VERCEL_ENV, ref main", { VERCEL_GIT_COMMIT_REF: "main", ...urls }, "skip"],
    ["a Vercel build without system variables and without the direct URL", { VERCEL: "1", DATABASE_URL: POOLED }, "skip"],
  ] as const)("%s -> %s", (_name, env, action) => {
    expect(decide(env, FAKE).action).toBe(action);
  });

  it("gives an unparsable DATABASE_URL its own message", () => {
    const decision = decide({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL: "not a url", DATABASE_URL_UNPOOLED: DIRECT }, FAKE);
    expect(decision.action).toBe("refuse");
    expect(decision.message).toContain("DATABASE_URL does not parse as a URL");
    expect(decision.message).not.toContain("different Neon endpoints");
  });

  it("says why a Vercel build without system variables refuses", () => {
    expect(decide({ VERCEL: "1", VERCEL_GIT_COMMIT_REF: "main", ...urls }, FAKE).message).toContain("Automatically expose System Environment Variables");
  });
});

describe("decide: the endpoint pinned per environment", () => {
  const on = (id: string) => ({
    DATABASE_URL: `postgresql://user:secret-pass@${id}-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`,
    DATABASE_URL_UNPOOLED: `postgresql://user:secret-pass@${id}.eu-central-1.aws.neon.tech/neondb?sslmode=require`,
  });
  const PINNED = { production: "ep-prod-111111", staging: "ep-stag-222222", develop: "ep-devl-333333" };
  const builds = [
    ["production", { VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, "deploy"],
    ["staging", { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" }, "deploy"],
    ["develop", { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop" }, "status"],
  ] as const;

  it.each(builds)("%s on its own endpoint -> %s", (name, build, action) => {
    expect(decide({ ...build, ...on(PINNED[name]) }, PINNED).action).toBe(action);
  });

  it.each(builds)("%s on another endpoint -> refuse, naming both ids and nothing secret", (name, build) => {
    const other = name === "production" ? PINNED.staging : PINNED.production;
    const decision = decide({ ...build, ...on(other) }, PINNED);
    expect(decision.action).toBe("refuse");
    expect(decision.message).toContain(PINNED[name]);
    expect(decision.message).toContain(other);
    expect(decision.message).not.toMatch(/secret-pass|user:|postgresql:|neon\.tech|neondb/);
  });

  it("refuses a preview build of ref staging (for example from a fork) whose URLs point at production", () => {
    expect(decide({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging", ...on(PINNED.production) }, PINNED).action).toBe("refuse");
  });

  it("pins three different endpoints by default, none of them the fake one", () => {
    const ids = Object.values(EXPECTED_NEON_ENDPOINTS);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^ep-[a-z0-9-]+$/);
    expect(decide({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", ...urls }).action).toBe("refuse");
  });

  it("reads the endpoint id from a pooled or a direct URL", () => {
    expect(neonEndpointId(POOLED)).toBe("ep-cool-name-123456");
    expect(neonEndpointId(DIRECT)).toBe("ep-cool-name-123456");
    expect(neonEndpointId("not a url")).toBeNull();
  });
});

describe("runMigrate: the exit code the Vercel build sees", () => {
  const id = EXPECTED_NEON_ENDPOINTS.staging;
  const DEPLOY_ENV: MigrateEnv = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging", DATABASE_URL: `postgresql://u:p@${id}-pooler.x.neon.tech/db`, DATABASE_URL_UNPOOLED: `postgresql://u:p@${id}.x.neon.tech/db` };
  const deps = (status: number | null) => ({
    spawn: vi.fn<RunDeps["spawn"]>(() => ({ status })),
    countMigrations: () => 11,
    info: vi.fn<RunDeps["info"]>(),
    error: vi.fn<RunDeps["error"]>(),
  });

  it("exits 0 and runs migrate deploy once when Prisma succeeds", () => {
    const d = deps(0);
    expect(runMigrate(DEPLOY_ENV, d)).toBe(0);
    expect(d.spawn.mock.calls).toEqual([[["exec", "prisma", "migrate", "deploy"]]]);
    expect(d.info).toHaveBeenLastCalledWith(expect.stringContaining("result=applied or already applied"));
  });

  it.each([[1], [null]])("exits 1 when Prisma's status is %s", (status) => {
    const d = deps(status);
    expect(runMigrate(DEPLOY_ENV, d)).toBe(1);
    expect(d.error).toHaveBeenCalledWith(expect.stringContaining("result=FAILED"));
  });

  it("exits 1 on a refusal without spawning anything", () => {
    const d = deps(0);
    expect(runMigrate({ ...DEPLOY_ENV, VERCEL_GIT_COMMIT_REF: undefined }, d)).toBe(1);
    expect(d.spawn).not.toHaveBeenCalled();
  });

  it("exits 0 on a skip without spawning anything", () => {
    const d = deps(0);
    expect(runMigrate({ DATABASE_URL: DEPLOY_ENV.DATABASE_URL }, d)).toBe(0);
    expect(d.spawn).not.toHaveBeenCalled();
  });
});
