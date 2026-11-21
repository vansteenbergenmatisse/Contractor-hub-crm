import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

// Real Postgres. Skipped unless RUN_PG_TESTS=1 (it writes a few rows and removes them). Run it only
// against Neon `develop`: RUN_PG_TESTS=1 pnpm vitest run tests/features/auth/invites-db.pg.test.ts
const enabled = process.env.RUN_PG_TESTS === "1";
if (enabled) config({ path: ".env.local", quiet: true });

describe.skipIf(!enabled)("invite and rate-limit queries on a real database", () => {
  const tag = randomUUID().slice(0, 8);
  let tenantId = "";
  let db: typeof import("@/features/auth/db/invites");
  let limit: typeof import("@/features/auth/db/rate-limit");
  let prisma: ReturnType<typeof import("@/shared/lib/prisma").getPrisma>;
  const emails: string[] = [];
  const keys: string[] = [];

  beforeAll(async () => {
    db = await import("@/features/auth/db/invites");
    limit = await import("@/features/auth/db/rate-limit");
    prisma = (await import("@/shared/lib/prisma")).getPrisma();
    tenantId = (await prisma.tenant.create({ data: { locationId: `test-loc-${tag}`, companyId: "test-co", name: "pg test" }, select: { id: true } })).id;
  });

  afterAll(async () => {
    if (!enabled) return;
    // Users first (they reference the tenant), then invites, then the tenant. Also sweeps leftovers
    // of an interrupted earlier run (tenants named "pg test" with a test location id).
    const stale = await prisma.tenant.findMany({ where: { name: "pg test", locationId: { startsWith: "test-loc-" } }, select: { id: true } });
    const ids = stale.map((t) => t.id);
    await prisma.user.deleteMany({ where: { OR: [{ email: { in: emails } }, { tenantId: { in: ids } }] } });
    await prisma.invite.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } });
  });

  const make = async (over: { role?: "owner" | "office" | "admin"; expiresAt?: Date; codeHash?: string } = {}) =>
    (await prisma.invite.create({
      data: {
        tenantId,
        email: `pg-${tag}@example.test`,
        role: over.role ?? "owner",
        hlUserId: "hl",
        codeHash: over.codeHash ?? `hash-${randomUUID()}`,
        expiresAt: over.expiresAt ?? new Date(Date.now() + 3600_000),
      },
      select: { id: true, codeHash: true },
    }));

  it("10 simultaneous claims: exactly one wins and usedAt is set", async () => {
    const { id } = await make();
    const results = await Promise.all(Array.from({ length: 10 }, () => db.claimInvite(id, new Date())));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await prisma.invite.findUnique({ where: { id } }))?.usedAt).not.toBeNull();
  });

  it("claims at exactly expiresAt fail; one millisecond earlier succeeds", async () => {
    const expiresAt = new Date(Date.now() + 3600_000);
    const a = await make({ expiresAt });
    expect(await db.claimInvite(a.id, expiresAt)).toBe(false);
    const b = await make({ expiresAt });
    expect(await db.claimInvite(b.id, new Date(expiresAt.getTime() - 1))).toBe(true);
  });

  it("a used invite cannot be claimed again; after release it can", async () => {
    const { id } = await make();
    expect(await db.claimInvite(id, new Date())).toBe(true);
    expect(await db.claimInvite(id, new Date())).toBe(false);
    await db.releaseInvite(id);
    expect(await db.claimInvite(id, new Date())).toBe(true);
  });

  it("a duplicate code hash is rejected by the database", async () => {
    const first = await make();
    await expect(make({ codeHash: first.codeHash })).rejects.toThrow();
  });

  it("findInviteByCodeHash returns an owner invite and nothing for an admin role row", async () => {
    const owner = await make();
    expect((await db.findInviteByCodeHash(owner.codeHash))?.id).toBe(owner.id);
    const sneaky = await make({ role: "admin" });
    expect(await db.findInviteByCodeHash(sneaky.codeHash)).toBeNull();
    expect(await db.findInviteByCodeHash("no-such-hash")).toBeNull();
  });

  it("deleteInvite removes the row", async () => {
    const { id, codeHash } = await make();
    await db.deleteInvite(id);
    expect(await db.findInviteByCodeHash(codeHash)).toBeNull();
  });

  it("emailTaken sees an existing user by its stored (lower-case) email", async () => {
    const email = `pg-user-${tag}@example.test`;
    emails.push(email);
    expect(await db.emailTaken(email)).toBe(false);
    await prisma.user.create({ data: { id: `pg-${tag}`, name: "pg", email, role: "owner", tenantId } });
    expect(await db.emailTaken(email)).toBe(true);
  });

  it("findTenantForInvite returns the tenant fields", async () => {
    expect(await db.findTenantForInvite(tenantId)).toMatchObject({ id: tenantId, companyId: "test-co", status: "connected" });
    expect(await db.findTenantForInvite("nope")).toBeNull();
  });

  it("rate limit: allows up to the limit in a window, refuses the next, resets after the window", async () => {
    const key = `test-${tag}`;
    keys.push(`app:${key}`);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const first = await Promise.all([1, 2, 3, 4, 5].map(() => limit.hitRateLimit(key, 3, 60_000, t0)));
    expect(first.filter(Boolean)).toHaveLength(3);
    expect(await limit.hitRateLimit(key, 3, 60_000, new Date(t0.getTime() + 59_000))).toBe(false);
    expect(await limit.hitRateLimit(key, 3, 60_000, new Date(t0.getTime() + 61_000))).toBe(true);
  });
});
