import { readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareMigrations, loadMigrationsView, MIGRATION_MANIFEST, type MigrationRow } from "@/features/admin";

// /admin/migrations: what this environment has applied, compared with what the code expects.
const at = new Date("2026-11-24T12:00:00Z");
const done = (name: string): MigrationRow => ({ name, finishedAt: at, rolledBackAt: null });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the migration manifest", () => {
  it("lists exactly the folders in prisma/migrations, oldest first", () => {
    const dirs = readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect([...MIGRATION_MANIFEST]).toEqual(dirs);
  });
});

describe("compareMigrations", () => {
  const manifest = ["a", "b", "c"];

  it("reports none pending when every migration finished", () => {
    expect(compareMigrations(manifest, manifest.map(done))).toEqual({ applied: manifest, pending: [], problems: [], notInCode: [], historyMissing: false });
  });

  it("lists what is missing as pending", () => {
    expect(compareMigrations(manifest, [done("a")])).toMatchObject({ applied: ["a"], pending: ["b", "c"] });
  });

  it("treats a missing history table as all pending", () => {
    expect(compareMigrations(manifest, null)).toEqual({ applied: [], pending: manifest, problems: [], notInCode: [], historyMissing: true });
  });

  it("counts a failed or rolled-back row as not applied and lists it", () => {
    const rows = [done("a"), { name: "b", finishedAt: null, rolledBackAt: null }, { name: "c", finishedAt: at, rolledBackAt: at }];
    expect(compareMigrations(manifest, rows)).toMatchObject({
      applied: ["a"],
      pending: ["b", "c"],
      problems: [{ name: "b", state: "failed" }, { name: "c", state: "rolled_back" }],
    });
  });

  it("does not list a rolled-back row once the same migration applied later", () => {
    const rows = [done("a"), { name: "b", finishedAt: at, rolledBackAt: at }, done("b"), done("c")];
    expect(compareMigrations(manifest, rows)).toMatchObject({ pending: [], problems: [] });
  });

  it("names a migration the database has but this code does not", () => {
    expect(compareMigrations(manifest, [...manifest.map(done), done("z")]).notInCode).toEqual(["z"]);
  });
});

describe("loadMigrationsView", () => {
  it("shows a read failure as a failure, never as none pending", async () => {
    const view = await loadMigrationsView(async () => { throw new Error("db"); });
    expect(view.readError).toBe(true);
    expect(view.expected).toBe(MIGRATION_MANIFEST.length);
  });

  it("names the environment from Vercel's variables", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
    const view = await loadMigrationsView(async () => null);
    expect(view).toMatchObject({ environment: "preview", ref: "staging", historyMissing: true, pending: [...MIGRATION_MANIFEST] });
    vi.unstubAllEnvs();
  });

  it("says local when Vercel's variables are not set", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "");
    const view = await loadMigrationsView(async () => MIGRATION_MANIFEST.map(done));
    expect(view).toMatchObject({ environment: "local", ref: null, pending: [] });
    vi.unstubAllEnvs();
  });
});
