"use client";

import type { PipelineResult } from "../types";
import { LivePipelineBoard } from "./LivePipelineBoard";
import { LivePipelineStatus } from "./LivePipelineStatus";

// Page content only. The shell adds the .fd-view wrapper. The server page loads `result`.
export function LivePipelinePage({ result }: { result: PipelineResult }) {
  if (result.state === "ready") return <LivePipelineBoard key={result.pipelineId} result={result} />;
  if (result.state === "empty") return <LivePipelineStatus state="empty" pipelines={result.pipelines} current={result.pipelineId} />;
  return <LivePipelineStatus state={result.state} />;
}
