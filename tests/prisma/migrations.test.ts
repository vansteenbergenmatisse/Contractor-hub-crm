import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "prisma", "migrations");
const sql = existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(join(dir, entry.name, "migration.sql"), "utf8"))
      .join("\n")
  : "";

describe("HighLevel install migration", () => {
  it.each(["Tenant", "HlAgencyConnection", "HlLocationConnection", "WebhookEvent"])(
    "creates table %s",
    (table) => {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    },
  );

  it.each([
    "Tenant_locationId_key",
    "HlAgencyConnection_companyId_key",
    "HlLocationConnection_tenantId_key",
    "HlLocationConnection_locationId_key",
    "WebhookEvent_webhookId_key",
  ])("has unique index %s", (index) => {
    expect(sql).toContain(`CREATE UNIQUE INDEX "${index}"`);
  });

  it("defines the three tenant statuses", () => {
    expect(sql).toMatch(/CREATE TYPE "TenantStatus" AS ENUM \('connected', 'needs_reconnect', 'uninstalled'\)/);
  });

  it("stores tokens only in encrypted columns", () => {
    expect(sql).toContain('"accessTokenEnc"');
    expect(sql).toContain('"refreshTokenEnc"');
    expect(sql).not.toMatch(/"(accessToken|refreshToken)"\s/);
  });

  it("ties a webhook event to its tenant and indexes it for purging", () => {
    expect(sql).toMatch(/"WebhookEvent" ADD CONSTRAINT [^\n]*FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\) ON DELETE SET NULL/);
    expect(sql).toContain('CREATE INDEX "WebhookEvent_tenantId_idx"');
    expect(sql).toContain('CREATE INDEX "WebhookEvent_receivedAt_idx"');
  });

  it("links a location connection to its tenant", () => {
    expect(sql).toMatch(/ALTER TABLE "HlLocationConnection" ADD CONSTRAINT [^\n]*FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\)/);
  });
});

describe("schema and migrations agree", () => {
  it("the migration SQL equals what prisma generates from schema.prisma", () => {
    // Changed on 2026-11-21 when the second migration (auth tables) landed, as the previous
    // version of this test said to do. `migrate diff --from-migrations` needs a shadow database,
    // which CI does not have, so this compares the statements instead: every statement prisma
    // generates from schema.prisma must appear in the migrations, and the migrations must hold no
    // other statement. It holds while migrations only add objects (no ALTER of an existing
    // table, no DROP, no data change); a migration that does more must be reviewed by hand and
    // this test replaced by a shadow-database diff.
    const generated = execFileSync(
      "pnpm",
      ["exec", "prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const statements = (text: string) =>
      text
        .replace(/\r\n/g, "\n")
        .replace(/^--.*$/gm, "")
        .split(/;\s*(?:\n|$)/)
        .map((statement) => statement.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .sort();
    expect(statements(sql)).toEqual(statements(generated));
  }, 30_000);

  it("the migrations only add objects (the statement comparison above relies on it)", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bALTER TABLE "\w+" (?!ADD CONSTRAINT)/);
    expect(sql).not.toMatch(/^\s*(UPDATE|DELETE FROM|INSERT INTO)\b/im);
  });

  it("every token field in the schema is stored encrypted (name ends in Enc)", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const fields = [...schema.matchAll(/^\s+(\w*[Tt]oken\w*)\s/gm)].map((match) => match[1]);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(field, `${field} must end in Enc`).toMatch(/Enc$/);
  });
});
