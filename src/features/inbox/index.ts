// Public API of the inbox feature. Other code imports from "@/features/inbox" only.
import type { SearchRow } from "@/features/app-shell";
import { toSearchRows } from "./api/search-rows";
import { MOCK_CONVERSATIONS } from "./mock";

export { InboxPage } from "./components/InboxPage";
export { InboxPageFromUrl } from "./components/InboxPageFromUrl";
export { InboxLivePage } from "./components/InboxLivePage";
export { InboxSkeleton } from "./components/InboxSkeleton";
export { channelOfType, loadInbox } from "./api/load-inbox";
export type { InboxReader, InboxResult } from "./types";
export { INBOX_WAITING_COUNT } from "./mock";
export { waitTier, waitLabel } from "./api/wait";

// Rows for the shell search (mock until Phase 3).
export const searchRows: SearchRow[] = toSearchRows(MOCK_CONVERSATIONS);
