// Public API of the pipeline feature. Other code imports from "@/features/pipeline" only.
import type { SearchRow } from "@/features/app-shell";
import { buildSearchRows } from "./api/send";
import { MOCK_CARDS } from "./mock";

export { PipelinePage } from "./components/PipelinePage";

// The real, read-only board. The route renders only these.
export { LivePipelinePage } from "./components/LivePipelinePage";
export { LivePipelineSkeleton } from "./components/LivePipelineSkeleton";
export { loadPipeline } from "./api/load-pipeline";
export { boardChunks, chunkOfStage, liveSearchRows } from "./api/live-board";
export type { LiveCard, LiveColumn, PipelineBoardAnswer, PipelineBoardReader, PipelineChoice, PipelineResult } from "./types";

// Rows the global search can find (sample cards, Phase 2).
export const searchRows: SearchRow[] = buildSearchRows(MOCK_CARDS);

// Pure logic, exported so the tests can reach it.
export { STAGES, GROUPS, groupOf, secondButton, hasTrash } from "./api/stages";
export { initialBoard, boardReducer, moveCard, loseCard, undoMove, pickStage, canUndo } from "./api/board";
export { cardView, stubView, stageCounts, groupCounts, computeLayout, needsPrice, nextStageLabel } from "./api/view";
export { buildSearchRows, sendDocFor, sendTotal } from "./api/send";
export { pressPlan } from "./api/press";
export type { PressPlan } from "./api/press";
export { calendarHref, quoteHref, cardIndexOfRow } from "./api/links";
export { MOCK_CARDS, MOCK_HIDDEN_COUNTS } from "./mock";
export type { BoardState, CardView, MockCard } from "./types";
