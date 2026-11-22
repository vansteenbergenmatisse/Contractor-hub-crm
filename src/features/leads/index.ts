// Public API of the leads feature. Other code imports from "@/features/leads" only.
export { LeadsPage } from "./components/LeadsPage";
export { searchRows } from "./api/search-rows";
export {
  createInitialState, filterCounts, firstNeedId, isWaiting, leadsReducer, sourceRows, summarize, tiles,
  validateLead, visibleAdded, visibleLeads, waitClass, waitLevel, waitingCount,
} from "./api/leads-logic";
export { MOCK_LEADS } from "./mock";
export type { Lead, LeadsAction, LeadsState, LeadStatus, SourceKey, Summary, WaitFilter } from "./types";
