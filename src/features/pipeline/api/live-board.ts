import type { SearchRow } from "@/features/app-shell";
import type { LiveColumn } from "../types";

// A tenant can have any number of stages. The design's grid draws five columns, so the stages are
// shown five at a time: each column takes slot 0 to 4, the classes the design's first group uses.
export const CHUNK_SIZE = 5;
export const MAX_LIVE_RANK = 47;

export type BoardChunk = { first: number; last: number };

export function boardChunks(stageCount: number): BoardChunk[] {
  const chunks: BoardChunk[] = [];
  for (let first = 0; first < stageCount; first += CHUNK_SIZE) {
    chunks.push({ first, last: Math.min(first + CHUNK_SIZE, stageCount) - 1 });
  }
  return chunks;
}

export const chunkOfStage = (stage: number): number => Math.floor(stage / CHUNK_SIZE);
export const slotOfStage = (stage: number): number => stage % CHUNK_SIZE;

export function chunkLabel(chunk: BoardChunk, stageCount: number): string {
  return stageCount <= CHUNK_SIZE ? "All stages" : `Stages ${chunk.first + 1}-${chunk.last + 1}`;
}

export function liveSearchRows(columns: readonly LiveColumn[], pipelineId: string): SearchRow[] {
  return columns.flatMap((column) =>
    column.cards.map((card) => ({
      id: `pipeline-${card.id}`,
      page: "pipeline" as const,
      name: card.name,
      sub: card.detail ? `${card.detail} · ${column.name}` : column.name,
      href: `/pipeline?pipeline=${encodeURIComponent(pipelineId)}`,
    })),
  );
}

export function stageOfRow(columns: readonly LiveColumn[], rowId: string | null): number {
  if (!rowId) return -1;
  return columns.findIndex((column) => column.cards.some((card) => `pipeline-${card.id}` === rowId));
}
