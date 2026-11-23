import { getPrisma } from "@/shared/lib/prisma";

const FORCED_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// One forced token replacement per tenant per 10 minutes, across all server instances. Atomic: the
// row comes back only for the caller that created the claim or found the previous one expired.
export async function claimForcedRefresh(tenantId: string, now: Date = new Date()): Promise<boolean> {
  const id = `app:token-forced-refresh:${tenantId}`;
  const nowMs = BigInt(now.getTime());
  const windowStart = nowMs - BigInt(FORCED_REFRESH_INTERVAL_MS);
  const rows = await getPrisma().$queryRaw<{ id: string }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${id}, ${id}, 1, ${nowMs})
    ON CONFLICT ("key") DO UPDATE SET "count" = 1, "lastRequest" = ${nowMs}
    WHERE "RateLimit"."lastRequest" < ${windowStart}
    RETURNING "id"`;
  return rows.length === 1;
}
