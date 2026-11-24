import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Wave E: the lock table. The migration is a file only; it is applied by CI (migrate deploy), never here.
const sql = readFileSync(join(process.cwd(), "prisma", "migrations", "20261124120000_custom_value_lock", "migration.sql"), "utf8");

describe("CustomValueLock migration", () => {
  it("creates the table with who locked the key and when", () => {
    expect(sql).toContain('CREATE TABLE "CustomValueLock"');
    for (const column of ['"tenantId"', '"key"', '"lockedByAdminId"', '"lockedAt"']) expect(sql).toContain(column);
  });

  it("has one lock per tenant and key", () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "CustomValueLock_tenantId_key_key" ON "CustomValueLock"("tenantId", "key")');
  });

  it("drops a tenant's locks with the tenant, and changes no existing table or row", () => {
    expect(sql).toMatch(/"CustomValueLock" ADD CONSTRAINT [^\n]*FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\) ON DELETE CASCADE/);
    expect(sql).not.toMatch(/\bDROP\b/);
    expect(sql).not.toMatch(/^\s*(UPDATE|DELETE FROM|INSERT INTO)\b/m);
    expect(sql).not.toMatch(/ALTER TABLE "(?!CustomValueLock")/);
  });
});
