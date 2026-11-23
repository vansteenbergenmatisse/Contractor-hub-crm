import { getPrisma } from "@/shared/lib/prisma";

const READ_LIMIT_MS = 1_500;
// Every outcome after which HighLevel may hold a new value. Read-only: the settings-write-back feature
// owns these rows, and it imports this feature, so it cannot hand this read in through its index.
const CHANGED = ["saved", "unknown", "reverted"];

// Changes when a Settings save finishes on any server instance, so each instance can drop its copy of
// the tenant's values. Holds a time only, never a value. Rejects when the database is slow or down.
export async function readBrandVersion(tenantId: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Brand version read timed out.")), READ_LIMIT_MS);
  });
  try {
    const query = getPrisma().customValueChange.aggregate({
      where: { tenantId, outcome: { in: CHANGED } },
      _max: { finishedAt: true },
    });
    const row = await Promise.race([query, limit]);
    return row._max.finishedAt?.toISOString() ?? null;
  } finally {
    clearTimeout(timer);
  }
}
