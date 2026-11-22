// The card's words. They ask the person to check and never state whether email is connected,
// because HighLevel's public API does not expose it. No menu path or link: the screen is undocumented.
export const MAILBOX_PROMPT_COPY = {
  title: "Using email from the CRM?",
  body: "Check that your mailbox is connected in HighLevel.",
  dismiss: "Dismiss",
  dismissLabel: "Dismiss mailbox reminder",
} as const;
