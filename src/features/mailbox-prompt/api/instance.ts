import { clearDismissal, isDismissed, saveDismissal } from "../db/dismissals";
import { createMailboxPromptService } from "./service";

const service = createMailboxPromptService({ isDismissed, saveDismissal, clearDismissal });

export const loadMailboxPrompt = service.load;
export const dismissMailboxPrompt = service.dismiss;
// See `reopen` in service.ts: the seam for a failed email send in Phase 3.
export const reopenMailboxPrompt = service.reopen;
