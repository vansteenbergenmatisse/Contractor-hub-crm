// Public API of the automations feature. Other code imports from "@/features/automations" only.
export { AutomationsPage } from "./components/AutomationsPage";

// The real, read-only page.
export { AutomationsLivePage } from "./components/AutomationsLivePage";
export { loadAutomations } from "./api/load-automations";
export type { AutomationsReader, AutomationsResult, LiveWorkflow, WorkflowRow } from "./types";
