// Public API of the leads feature. Other code imports from "@/features/leads" only.
export { LeadsPage } from "./components/LeadsPage";
export { liveSearchRows, searchRows } from "./api/search-rows";
export {
  MAX_ADDED, createInitialState, filterCounts, firstNeedId, isWaiting, leadsReducer, sourceRows, summarize, tiles,
  validateLead, visibleAdded, visibleLeads, waitClass, waitLevel, waitingCount,
} from "./api/leads-logic";
export { MOCK_LEADS } from "./mock";
export type { Lead, LeadsAction, LeadsState, LeadStatus, SourceKey, Summary, WaitFilter } from "./types";
