// Public API of the quotes feature. Other code imports from "@/features/quotes" only.
export { QuotesPage } from "./components/QuotesPage";
export { QuoteSheet } from "./components/QuoteSheet";
export { QuotesLivePage } from "./components/QuotesLivePage";
export { loadQuotes, type QuotesReader } from "./api/load-quotes";
export { isQuotesPageLive } from "./api/page-flag";
export type { LiveQuote, QuotesResult } from "./types";
export { searchRows, SEED_QUOTES, mockBuildLines } from "./mock";
export {
  MAX_LINES, amountLabel, buildDraftOf, canApprove, checkBuild, checkEdit, chipClass, draftOf, filterCounts, formatMoney, initialState, isVisible,
  parsePrice, quoteByName, quoteHref, quoteSearchRows, quotesReducer, rowFillId, rowFromSearch, sendRequest, statusText, sumLines, totals, uploadName,
} from "./api/quotes";
export { quoteRowActions } from "./api/row-actions";
export type { QuoteRowHandlers } from "./api/row-actions";
export { hasBusinessHeader, sheetBusiness } from "./api/sheet-business";
export { QUOTES_KEY, useQuotesKept } from "./hooks/use-quotes";
export type { BuildDraft, Quote, QuoteLine, QuoteOpen, QuoteStatus, QuotesAction, QuotesState } from "./types";
