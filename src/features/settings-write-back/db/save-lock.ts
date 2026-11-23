import { randomUUID } from "node:crypto";
import { getPrisma } from "@/shared/lib/prisma";

// One save per tenant at a time. A lease, not a held database lock, so no connection stays open during
// HighLevel calls. It outlasts the route's 60 seconds, and a crashed save frees it by expiring.
export async function claimSaveLock(tenantId: string): Promise<string | null> {
  const holder = randomUUID();
  const rows = await getPrisma().$queryRaw<Array<{ holder: string }>>`
    INSERT INTO "CustomValueSaveLock" ("tenantId", "holder", "expiresAt")
    VALUES (${tenantId}, ${holder}, (NOW() AT TIME ZONE 'UTC') + INTERVAL '90 seconds')
    ON CONFLICT ("tenantId") DO UPDATE
      SET "holder" = EXCLUDED."holder", "expiresAt" = EXCLUDED."expiresAt"
      WHERE "CustomValueSaveLock"."expiresAt" < (NOW() AT TIME ZONE 'UTC')
    RETURNING "holder"`;
  return rows[0]?.holder === holder ? holder : null;
}

export async function releaseSaveLock(tenantId: string, holder: string): Promise<void> {
  await getPrisma().customValueSaveLock.deleteMany({ where: { tenantId, holder } });
}
