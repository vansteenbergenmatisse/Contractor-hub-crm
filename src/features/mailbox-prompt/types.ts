// Types shared inside the mailbox-prompt feature.

// The session fields the prompt needs. Always from the server session, never from a request body.
export type PromptUser = { id: string; role: string; tenantId: string | null };

// `token` is new on every server render of the layout: a card closed under one token stays closed
// while the person moves between pages, and a later render can show it again.
export type MailboxPromptView = { show: boolean; token: string };

export type DismissalStore = {
  isDismissed: (userId: string, tenantId: string) => Promise<boolean>;
  saveDismissal: (userId: string, tenantId: string) => Promise<void>;
  clearDismissal: (userId: string, tenantId: string) => Promise<void>;
};
