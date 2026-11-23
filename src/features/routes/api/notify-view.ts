import type { NotifyOutcome, RoutesNotifyView, RoutesResult } from "../types";

type ViewUser = { id: string; role: "owner" | "office" | "admin"; tenantId: string | null; viewing?: boolean };
type ViewDeps = {
  isEnabled: (tenantId: string) => boolean;
  readOutcomes: (tenantId: string, ids: string[]) => Promise<Array<{ appointmentId: string; outcome: string }>>;
};

// A stored row that never got its result may have fired, so it reads as unconfirmed.
export const toNotifyOutcome = (stored: string): NotifyOutcome =>
  stored === "notified" || stored === "failed" ? stored : "unconfirmed";

// What the page may show. Null (no toggle) with the flag off, for an admin and in View as client.
export async function loadNotifyView(user: ViewUser | null | undefined, result: RoutesResult, deps: ViewDeps): Promise<RoutesNotifyView | null> {
  if (!user || user.viewing || user.role === "admin" || !user.tenantId || !deps.isEnabled(user.tenantId)) return null;
  const outcomes: Record<string, NotifyOutcome> = {};
  if (result.state === "ready") {
    try {
      for (const row of await deps.readOutcomes(user.tenantId, result.jobs.map((job) => job.id))) {
        outcomes[row.appointmentId] = toNotifyOutcome(row.outcome);
      }
    } catch {
      // The route still enforces once per job. Only the stored label is missing.
      console.error("Routes notify failed: step=read-outcomes");
    }
  }
  return { userId: user.id, outcomes };
}
