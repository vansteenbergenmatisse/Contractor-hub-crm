// Public API of the mailbox-prompt feature. Other code imports from "@/features/mailbox-prompt" only.
// Server code is exported here, so a client component must not import this file.
export { MailboxPromptCard } from "./components/MailboxPromptCard";
export { MAILBOX_PROMPT_COPY } from "./api/copy";
export { canSeeMailboxPrompt, createMailboxPromptService } from "./api/service";
export { dismissMailboxPrompt, loadMailboxPrompt, reopenMailboxPrompt } from "./api/instance";
export { dismissFailure, handleDismiss } from "./api/dismiss-route";
export type { DismissalStore, MailboxPromptView, PromptUser } from "./types";
