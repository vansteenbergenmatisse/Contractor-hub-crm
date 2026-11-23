import type { LiveCard, PipelineBoardAnswer, PipelineBoardReader, PipelineResult } from "../types";

const DAY_MS = 86_400_000;
const amountFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type Row = Extract<PipelineBoardAnswer, { ok: true }>["opportunities"][number];

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
}

function sinceText(changedAt: string | null, now: Date): string {
  if (!changedAt) return "";
  const elapsed = now.getTime() - Date.parse(changedAt);
  if (elapsed < 0) return "";
  const days = Math.floor(elapsed / DAY_MS);
  // Under 24 hours can still be yesterday. The location's zone is not known here, so days compare in UTC.
  if (days === 0) return new Date(changedAt).toISOString().slice(0, 10) === now.toISOString().slice(0, 10) ? "In this stage today" : "Under 1 day in this stage";
  return days === 1 ? "1 day in this stage" : `${days} days in this stage`;
}

function toCard(row: Row, now: Date): LiveCard {
  const name = row.contactName ?? row.name ?? "Unnamed deal";
  return {
    id: row.id,
    name,
    init: initials(name),
    detail: row.contactName && row.name && row.name !== row.contactName ? row.name : "",
    // No currency: the API does not state one. Zero is hidden, because unset and a real zero look alike.
    amount: row.monetaryValue !== null && row.monetaryValue > 0 ? amountFormat.format(row.monetaryValue) : "",
    since: sinceText(row.lastStageChangeAt, now),
  };
}

// The board of one tenant, read by `read` (the server page passes its reader). The tenant comes from
// the server session. Never sample data: a failure is a state the page shows. Setting the server
// flag PIPELINE_READ_DISABLED=true turns the read off and shows the unavailable state.
export async function loadPipeline(
  tenantId: string | null | undefined,
  read: PipelineBoardReader,
  pipelineId?: string,
  now: () => Date = () => new Date(),
): Promise<PipelineResult> {
  if (!tenantId || process.env.PIPELINE_READ_DISABLED?.trim() === "true") return { state: "unavailable" };
  let answer: PipelineBoardAnswer;
  try {
    answer = await read(tenantId, pipelineId);
  } catch {
    return { state: "unavailable" };
  }
  if (!answer.ok) return { state: answer.reason };
  if (answer.dropped > 0) console.warn(`Pipeline: left out ${answer.dropped} malformed rows.`);
  if (answer.opportunities.length === 0 && answer.dropped > 0) return { state: "unavailable" };
  const pipelines = answer.pipelines.map(({ id, name }) => ({ id, name }));
  if (answer.pipelineId === null) return { state: "empty", pipelines: [], pipelineId: null };
  const selected = answer.pipelines.find((p) => p.id === answer.pipelineId);
  if (!selected) return { state: "unavailable" };
  if (answer.opportunities.length === 0) return { state: "empty", pipelines, pipelineId: selected.id };
  // Deals with no stage to sit in cannot be drawn, and must not read as an empty pipeline.
  if (selected.stages.length === 0) return { state: "unavailable" };
  const at = now();
  const columns = selected.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    cards: answer.opportunities.filter((row) => row.stageId === stage.id).map((row) => toCard(row, at)),
  }));
  return { state: "ready", pipelines, pipelineId: selected.id, columns, loadedAt: at.toISOString(), complete: answer.complete, dropped: answer.dropped };
}
