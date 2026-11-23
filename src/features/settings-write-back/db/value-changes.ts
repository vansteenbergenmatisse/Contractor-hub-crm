import { getPrisma } from "@/shared/lib/prisma";
import type { AuditOutcome } from "../api/write-back";

// The audit trail and undo data of Settings write-backs. A row starts as "pending" before HighLevel
// is called, so a crash in between still leaves a trace.
export async function beginValueChange(row: { tenantId: string; actorId: string; key: string; previousValue: string; newValue: string }): Promise<string> {
  const created = await getPrisma().customValueChange.create({ data: row, select: { id: true } });
  return created.id;
}

export async function finishValueChange(id: string, outcome: AuditOutcome): Promise<void> {
  await getPrisma().customValueChange.update({ where: { id }, data: { outcome, finishedAt: new Date() } });
}
