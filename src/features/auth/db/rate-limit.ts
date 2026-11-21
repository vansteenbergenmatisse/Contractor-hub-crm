import { getPrisma } from "@/shared/lib/prisma";

// Fixed-window counter in the RateLimit table (shared with Better Auth, keys here start with
// "app:"). One atomic upsert: serverless instances share no memory. Returns true when the call is
// allowed. A database failure propagates: callers deny (fail closed).
const PRUNE_AFTER_MS = 2 * 3600_000; // longer than the longest window (1 hour)

export async function hitRateLimit(key: string, limit: number, windowMs: number, now: Date): Promise<boolean> {
  const nowMs = BigInt(now.getTime());
  const windowStart = nowMs - BigInt(windowMs);
  const id = `app:${key}`;
  const rows = await getPrisma().$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${id}, ${id}, 1, ${nowMs})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN ${nowMs} ELSE "RateLimit"."lastRequest" END
    RETURNING "count"`;
  // About one call in a hundred removes counters that are long past their window (the table
  // would otherwise grow with every new key). A failure here never blocks the request.
  if (Math.random() < 0.01) {
    await getPrisma()
      .rateLimit.deleteMany({ where: { key: { startsWith: "app:" }, lastRequest: { lt: nowMs - BigInt(PRUNE_AFTER_MS) } } })
      .catch(() => {});
  }
  return Number(rows[0]?.count ?? Infinity) <= limit;
}
