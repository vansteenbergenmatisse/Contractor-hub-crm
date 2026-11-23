import type { AutomationsReader, AutomationsResult, LiveWorkflow } from "../types";

const statusOf = (status: string | null): LiveWorkflow["status"] => {
  const value = status?.toLowerCase();
  return value === "published" || value === "draft" ? value : "unknown";
};

// The workflows of one tenant, read by `read` (the server page passes its reader). The tenant comes
// from the server session. Never sample data: a failure is a state the page shows. Setting the server
// flag AUTOMATIONS_READ_DISABLED=true turns the read off and shows the unavailable state.
export async function loadAutomations(
  tenantId: string | null | undefined,
  read: AutomationsReader,
  now: () => Date = () => new Date(),
): Promise<AutomationsResult> {
  if (!tenantId || process.env.AUTOMATIONS_READ_DISABLED === "true") return { state: "unavailable" };
  let answer;
  try {
    answer = await read(tenantId);
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Automations: left out ${answer.dropped} malformed rows.`);
  if (answer.workflows.length === 0) {
    // A gap that may hide a real workflow must not read as "none".
    return answer.dropped > 0 || !answer.complete ? { state: "unavailable" } : { state: "empty" };
  }
  const workflows = answer.workflows.map((w): LiveWorkflow => ({ id: w.id, name: w.name ?? "Unnamed automation", status: statusOf(w.status) }));
  return {
    state: "ready",
    workflows,
    totals: {
      published: workflows.filter((w) => w.status === "published").length,
      draft: workflows.filter((w) => w.status === "draft").length,
      all: workflows.length,
    },
    complete: answer.complete,
    dropped: answer.dropped,
    loadedAt: now().toISOString(),
  };
}
